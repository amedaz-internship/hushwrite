import { useState, useEffect, useRef, useCallback } from "react";
import MDEditor, { commands as mdCommands } from "@uiw/react-md-editor";
import toast from "react-hot-toast";
import IdbImage from "./IdbImage.jsx";
import { useTheme } from "@/lib/theme.jsx";
import {
  saveNote,
  getAllNotes,
  getNote,
  deleteNote,
  saveImage,
  deleteImage,
} from "../js/db";
import { v4 as uuid4 } from "uuid";
import ExportNote from "./ExportNotes.jsx";
import Preview from "./Preview.jsx";
import {
  deriveKey,
  encryptContent,
  decryptContent,
  generateSalt,
} from "../js/crypto";
import PassphraseModal from "./PassPhraseModal.jsx";
import DeleteModal from "./DeleteModal.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Trash2, ImagePlus, FileText, Lock, CheckCircle2, Loader2 } from "lucide-react";

// Tier 1 timings.
const AUTOSAVE_DEBOUNCE_MS = 1500;
const IDLE_LOCK_MS = 5 * 60 * 1000;

// Pull image IDs out of a markdown string. Embedded images use the
// `idb://<uuid>` URL scheme so the markdown source stays small and we don't
// have to mangle it on save (no data URLs ever live in the source). The
// resolver in IdbImage hydrates them at render time.
const IDB_IMG_REGEX = /!\[[^\]]*\]\(idb:\/\/([0-9a-f-]+)\)/gi;
const extractImageIds = (md) => {
  const ids = [];
  for (const m of md.matchAll(IDB_IMG_REGEX)) ids.push(m[1]);
  return ids;
};

const Markdown = ({
  selectedNote,
  markdown,
  setMarkdown,
  currentId,
  setCurrentId,
  title,
  setTitle,
  setNotes,
}) => {
  const fileInputRef = useRef(null);
  const { theme } = useTheme();

  const [modal, setModal] = useState(null);

  // Tier 1 session state.
  // sessionKeyRef holds the non-extractable AES-GCM CryptoKey for the current
  // unlocked note. sessionSaltRef holds the salt that key was derived against
  // (frozen for the lifetime of this unlock — we only roll the salt when the
  // user explicitly changes passphrase). lastSavedRef tracks the last
  // successfully-persisted markdown/title pair so we know when there's
  // something to flush.
  const sessionKeyRef = useRef(null);
  const sessionSaltRef = useRef(null);
  const lastSavedRef = useRef({ markdown: "", title: "" });
  const isSavingRef = useRef(false);
  const idleTimerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Save status surfaced in the header. "idle" | "dirty" | "saving" | "saved" | "locked"
  const [saveStatus, setSaveStatus] = useState("idle");

  useEffect(() => {
    if (!currentId) setTitle("");
  }, [currentId, setTitle]);

  // Open a modal and return a Promise that settles when the user confirms or
  // cancels. If a previous modal is still open, reject its Promise first so
  // its caller doesn't hang forever (H5).
  const askPassphrase = useCallback((mode) => {
    return new Promise((resolve, reject) => {
      setModal((prev) => {
        prev?.reject?.(new Error("superseded"));
        return { type: "passphrase", mode, resolve, reject };
      });
    });
  }, []);

  const askDeleteConfirm = useCallback(() => {
    return new Promise((resolve, reject) => {
      setModal((prev) => {
        prev?.reject?.(new Error("superseded"));
        return { type: "delete", resolve, reject };
      });
    });
  }, []);

  const closeModal = () => setModal(null);

  const handlePassphraseConfirm = (pw) => {
    const { resolve } = modal;
    closeModal();
    resolve(pw);
  };
  const handleDeleteConfirm = () => {
    const { resolve } = modal;
    closeModal();
    resolve(true);
  };
  const handleModalCancel = () => {
    const { reject } = modal;
    closeModal();
    reject(new Error("cancelled"));
  };

  // Encrypt+persist the current editor state. Used by both the manual Save
  // button (which prompts for a passphrase the first time) and the background
  // auto-save (which uses the cached session key). Returns true on success.
  const persistNote = useCallback(
    async (key, salt) => {
      if (isSavingRef.current) return false;
      if (!markdown.trim() || !title.trim()) return false;

      isSavingRef.current = true;
      setSaveStatus("saving");
      try {
        // Markdown source already stores image references as `idb://<uuid>`
        // — no inline data URLs to strip. Encrypt as-is.
        const { ciphertext, iv } = await encryptContent(markdown, key);
        const imageIds = extractImageIds(markdown);

        const existingNote = currentId ? await getNote(currentId) : null;

        // Garbage-collect images that were removed from the note since last save.
        if (existingNote?.imageIds?.length) {
          const stillReferenced = new Set(imageIds);
          const removed = existingNote.imageIds.filter(
            (id) => !stillReferenced.has(id),
          );
          await Promise.all(removed.map((id) => deleteImage(id)));
        }

        const id = currentId || uuid4();
        await saveNote({
          id,
          title: title.trim(),
          ciphertext: Array.from(ciphertext),
          iv: Array.from(iv),
          salt: Array.from(salt),
          imageIds,
          createdAt: existingNote?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        setCurrentId(id);
        setNotes(await getAllNotes());
        lastSavedRef.current = { markdown, title };
        setSaveStatus("saved");
        return true;
      } catch (err) {
        console.error("[persistNote] failed:", err);
        setSaveStatus("dirty");
        throw err;
      } finally {
        isSavingRef.current = false;
      }
    },
    [markdown, title, currentId, setCurrentId, setNotes],
  );

  // Background auto-save. Silent (no toast). Only runs if the note is already
  // unlocked (cached key present). Brand-new notes have no key and are
  // skipped — the user must perform a manual save first.
  const autoSave = useCallback(async () => {
    if (!sessionKeyRef.current || !sessionSaltRef.current) return;
    try {
      await persistNote(sessionKeyRef.current, sessionSaltRef.current);
    } catch {
      // swallow — status indicator already shows "dirty"
    }
  }, [persistNote]);

  // Internal helper: wipe everything in memory. Always safe to call.
  const wipeSession = useCallback(() => {
    sessionKeyRef.current = null;
    sessionSaltRef.current = null;
    lastSavedRef.current = { markdown: "", title: "" };
    setMarkdown("");
    setTitle("");
    setCurrentId(null);
    setSaveStatus("locked");
  }, [setMarkdown, setTitle, setCurrentId]);

  // The lock function. Three branches depending on what's in memory:
  //
  //   1. Unlocked existing note + dirty edits → flush with cached key, wipe.
  //   2. Brand-new note (no key) + content+title typed → prompt for passphrase,
  //      derive a key, encrypt, persist, wipe. If user cancels the prompt
  //      (i.e. "I'm here, don't lock me out"), we leave the session intact.
  //   3. Anything else (no dirty content, or empty note) → just wipe.
  //
  // Branch 1's wipe is unconditional even if the flush throws — the lock
  // guarantee has to be absolute for already-saved notes. Branch 2 is the
  // new-note path: we *can't* wipe without saving first (no key, no recovery),
  // and we *can't* save without a passphrase, so the prompt is mandatory.
  const lock = useCallback(async () => {
    clearTimeout(idleTimerRef.current);
    clearTimeout(debounceTimerRef.current);

    const isDirty =
      markdown !== lastSavedRef.current.markdown ||
      title !== lastSavedRef.current.title;

    // Branch 1: existing unlocked note with edits.
    if (sessionKeyRef.current && sessionSaltRef.current) {
      if (isDirty) {
        try {
          await persistNote(sessionKeyRef.current, sessionSaltRef.current);
        } catch {
          toast.error("Lock: last save failed, recent edits may be lost.");
        }
      }
      wipeSession();
      return;
    }

    // Branch 2: brand-new note that has content but no key yet. Prompt for a
    // passphrase so we can encrypt-and-save before wiping. If the user
    // dismisses the prompt, treat that as "I'm still here, don't lock" and
    // leave the in-memory draft alone — the next idle period will retry.
    if (!currentId && isDirty && markdown.trim() && title.trim()) {
      try {
        const pw = await askPassphrase("encrypt");
        const salt = generateSalt();
        const key = await deriveKey(pw, salt);
        await persistNote(key, salt);
        // Save succeeded — now wipe. We deliberately do NOT cache the key
        // here; the user is being locked out, not unlocked.
        wipeSession();
      } catch (err) {
        if (err.message !== "cancelled" && err.message !== "superseded") {
          toast.error(err.message);
        }
        // Cancelled/failed: leave the draft in memory. The user is present
        // and explicitly chose not to save right now.
      }
      return;
    }

    // Branch 3: nothing to flush. Plain wipe.
    wipeSession();
  }, [markdown, title, currentId, persistNote, wipeSession, askPassphrase]);

  // Load + decrypt a note when the user picks one from the sidebar. On
  // success, cache the derived key and salt so subsequent edits auto-save
  // without re-prompting.
  useEffect(() => {
    const loadSelectedNote = async () => {
      if (!selectedNote) return;
      try {
        const pw = await askPassphrase("decrypt");
        const salt = new Uint8Array(selectedNote.salt);
        const key = await deriveKey(pw, salt);
        const decrypted = await decryptContent(
          new Uint8Array(selectedNote.ciphertext),
          key,
          new Uint8Array(selectedNote.iv),
        );

        sessionKeyRef.current = key;
        sessionSaltRef.current = salt;
        lastSavedRef.current = {
          markdown: decrypted,
          title: selectedNote.title || "",
        };

        setMarkdown(decrypted);
        setCurrentId(selectedNote.id);
        setTitle(selectedNote.title || "");
        setSaveStatus("saved");
        toast.success("Note unlocked");
      } catch (err) {
        if (err.message !== "cancelled" && err.message !== "superseded") {
          toast.error(err.message);
        }
      }
    };
    loadSelectedNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote]);

  // Manual Save button. For a brand-new note (no cached key) it prompts for a
  // passphrase, derives a key, persists, and *caches* the key — from this
  // moment on the note is "warm" and auto-save will run silently. For an
  // already-unlocked note this is just a forced flush.
  const onSave = async () => {
    if (!markdown.trim()) {
      toast.error("Empty note!");
      return;
    }
    if (!title.trim()) {
      toast.error("Please enter a note title!");
      return;
    }

    try {
      if (sessionKeyRef.current && sessionSaltRef.current) {
        await persistNote(sessionKeyRef.current, sessionSaltRef.current);
        toast.success("Saved");
        return;
      }

      const pw = await askPassphrase("encrypt");
      const salt = generateSalt();
      const key = await deriveKey(pw, salt);
      await persistNote(key, salt);

      sessionKeyRef.current = key;
      sessionSaltRef.current = salt;
      toast.success("Encrypted & saved");
    } catch (err) {
      if (err.message !== "cancelled" && err.message !== "superseded") {
        toast.error(err.message);
      }
    }
  };

  const handleDelete = async () => {
    if (!currentId) {
      toast.error("No note selected!");
      return;
    }
    try {
      await askDeleteConfirm();
      const note = await getNote(currentId);
      if (!note) {
        toast.error("Note not found");
        return;
      }

      // Require passphrase verification before destroying the note. Even if
      // the session is currently unlocked (cached key in memory), we re-derive
      // from the user-supplied passphrase against the note's stored salt and
      // attempt to decrypt the existing ciphertext. A successful decrypt
      // proves the user knows the passphrase; a failure throws via
      // decryptContent's generic error and aborts the delete.
      //
      // This protects against an attacker walking up to an unlocked editor
      // and wiping notes — destruction always requires the passphrase.
      const pw = await askPassphrase("decrypt");
      const verifyKey = await deriveKey(pw, new Uint8Array(note.salt));
      await decryptContent(
        new Uint8Array(note.ciphertext),
        verifyKey,
        new Uint8Array(note.iv),
      );

      // Drop the note's images from IndexedDB so they don't pile up forever.
      if (note?.imageIds?.length) {
        await Promise.all(note.imageIds.map((id) => deleteImage(id)));
      }
      await deleteNote(currentId);

      // Wipe session — the note is gone, the cached key has nothing to encrypt.
      sessionKeyRef.current = null;
      sessionSaltRef.current = null;
      lastSavedRef.current = { markdown: "", title: "" };

      setMarkdown("");
      setTitle("");
      setCurrentId(null);
      setNotes(await getAllNotes());
      setSaveStatus("idle");
      toast.success("Note deleted!");
    } catch (err) {
      if (err.message !== "cancelled" && err.message !== "superseded") {
        toast.error(err.message || "Delete failed");
      }
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    try {
      const id = uuid4();
      await saveImage({ id, blob: file });
      // Insert a markdown image with the idb:// scheme. The actual blob lives
      // in the images store; IdbImage hydrates it at render time. The markdown
      // source stays small and contains no inline base64.
      const altText = file.name.replace(/\.[^.]+$/, "");
      const snippet = `\n![${altText}](idb://${id})\n`;
      setMarkdown((prev) => (prev || "") + snippet);
      toast.success("Image attached!");
    } catch (err) {
      toast.error("Failed to attach image: " + err.message);
    }
  };

  // Debounced auto-save / dirty indicator. Two cases:
  //   - Unlocked existing note (cached key): mark dirty, schedule a silent
  //     background save 1.5s after the last edit.
  //   - Brand-new note (no key): mark dirty so the UI matches the unlocked
  //     experience. We can't actually persist without a passphrase, so the
  //     real save happens at lock time (idle timer / Lock button / tab-hide),
  //     where the user gets prompted once.
  useEffect(() => {
    const isDirty =
      markdown !== lastSavedRef.current.markdown ||
      title !== lastSavedRef.current.title;
    if (!isDirty) return;
    if (!markdown.trim() || !title.trim()) return;

    setSaveStatus("dirty");

    if (!sessionKeyRef.current) return; // new note: no background save
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      autoSave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(debounceTimerRef.current);
  }, [markdown, title, autoSave]);

  // Idle auto-lock: any keystroke (markdown/title change) resets a 5-minute
  // timer. When it fires, lock() runs. For an unlocked existing note this
  // flushes-then-wipes; for a brand-new note with content+title it prompts
  // for a passphrase, encrypts, persists, then wipes.
  //
  // We arm the timer in two cases:
  //   - The note is unlocked (cached key) — standard idle-lock.
  //   - The note is brand-new (no key) but the user has typed both a title
  //     and content — after 5 min of inactivity, prompt to save+lock.
  useEffect(() => {
    const hasContent = markdown.trim() && title.trim();
    const armed = sessionKeyRef.current || (!currentId && hasContent);
    if (!armed) return;

    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      lock();
      toast("Locked due to inactivity", { icon: "🔒" });
    }, IDLE_LOCK_MS);
    return () => clearTimeout(idleTimerRef.current);
  }, [markdown, title, currentId, lock]);

  // Tab-hide and unload locks. visibilitychange fires when the user switches
  // tabs or minimizes; pagehide fires when the page is being torn down.
  //
  // For an unlocked existing note: lock() flushes-then-wipes silently.
  // For a brand-new note: lock() pops the passphrase modal so the user can
  // encrypt+save before the wipe (the modal sits open until they come back
  // to the tab and respond — same UX as the idle-lock prompt).
  //
  // pagehide can't show a modal (the page is going away), so for new notes
  // we rely on beforeunload's native browser dialog as the safety net.
  useEffect(() => {
    const isDirty = () =>
      markdown !== lastSavedRef.current.markdown ||
      title !== lastSavedRef.current.title;
    const hasNewNoteDraft = () =>
      !currentId && markdown.trim() && title.trim() && isDirty();

    const onVisibility = () => {
      if (!document.hidden) return;
      if (sessionKeyRef.current || hasNewNoteDraft()) {
        lock();
      }
    };
    const onPageHide = () => {
      // Only the existing-note flush path is safe here — pagehide can't await
      // a modal. New-note drafts are protected by beforeunload below.
      if (sessionKeyRef.current) lock();
    };
    const onBeforeUnload = (e) => {
      if (isDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [lock, markdown, title, currentId]);

  const statusLabel = (() => {
    switch (saveStatus) {
      case "saving":
        return (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
          </span>
        );
      case "saved":
        return (
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        );
      case "dirty":
        return (
          <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            Unsaved changes
          </span>
        );
      case "locked":
        return (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Locked
          </span>
        );
      default:
        return null;
    }
  })();

  return (
    <main className="scrollbar-thin flex h-screen flex-1 flex-col overflow-y-auto">
      {modal?.type === "passphrase" && (
        <PassphraseModal
          mode={modal.mode}
          onConfirm={handlePassphraseConfirm}
          onCancel={handleModalCancel}
        />
      )}
      {modal?.type === "delete" && (
        <DeleteModal
          onConfirm={handleDeleteConfirm}
          onCancel={handleModalCancel}
        />
      )}

      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/80 px-8 py-4 backdrop-blur">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>{currentId ? "Editing note" : "New note"}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {statusLabel}
          {(sessionKeyRef.current ||
            (!currentId && markdown.trim() && title.trim())) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                lock();
                toast("Locked", { icon: "🔒" });
              }}
            >
              <Lock className="mr-1.5 h-3.5 w-3.5" />
              Lock
            </Button>
          )}
        </div>
      </header>

      <div className="flex w-full flex-1 gap-8 p-8">
        <div className="flex flex-[0_0_60%] flex-col gap-4">
          <Input
            type="text"
            placeholder="Untitled note"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-12 border-0 border-b border-border bg-transparent px-1 text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <div data-color-mode={theme}>
            <MDEditor
              value={markdown}
              onChange={(val) => setMarkdown(val || "")}
              height={500}
              preview="edit"
              previewOptions={{
                components: { img: IdbImage },
              }}
              commands={[
                mdCommands.bold,
                mdCommands.italic,
                mdCommands.strikethrough,
                mdCommands.hr,
                mdCommands.divider,
                mdCommands.link,
                mdCommands.quote,
                mdCommands.code,
                mdCommands.codeBlock,
                mdCommands.divider,
                mdCommands.unorderedListCommand,
                mdCommands.orderedListCommand,
                mdCommands.checkedListCommand,
                mdCommands.divider,
                mdCommands.help,
              ]}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleImageUpload}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current.click()}
            >
              <ImagePlus className="mr-1.5 h-4 w-4" />
              Image
            </Button>
            <ExportNote note={{ content: markdown, title }} />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
            <Button size="sm" onClick={onSave} className="shadow-sm">
              <Save className="mr-1.5 h-4 w-4" />
              Save
            </Button>
          </div>
        </div>

        <div className="flex flex-[0_0_40%] flex-col gap-6">
          <Preview markdown={markdown} />
        </div>
      </div>
    </main>
  );
};

export default Markdown;
