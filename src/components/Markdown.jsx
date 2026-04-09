import { useState, useEffect, useRef, useCallback } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";
import toast from "react-hot-toast";
import {
  saveNote,
  getAllNotes,
  getNote,
  deleteNote,
  saveImage,
  getImage,
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

// Pull image IDs out of an HTML string by reading every <img data-img-id="...">.
const extractImageIds = (htmlContent) => {
  const div = document.createElement("div");
  div.innerHTML = htmlContent;
  return Array.from(div.querySelectorAll("img[data-img-id]")).map(
    (img) => img.dataset.imgId,
  );
};

// Strip data: URLs from <img> tags before encryption — the actual blob is
// stored in the IndexedDB images store and re-hydrated on load. Without this,
// every save would store each image twice (and 3-4× its raw size, base64).
const stripImageSources = (htmlContent) => {
  const div = document.createElement("div");
  div.innerHTML = htmlContent;
  for (const img of div.querySelectorAll("img[data-img-id]")) {
    img.removeAttribute("src");
  }
  return div.innerHTML;
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
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

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
  // Re-entry guard so the new-note passphrase prompt doesn't re-fire on every
  // keystroke while the modal is already open.
  const isPromptingRef = useRef(false);

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

  // Re-hydrate <img> data: URLs from the images store after decryption.
  const renderImages = async (htmlContent) => {
    const div = document.createElement("div");
    div.innerHTML = htmlContent;
    for (const img of div.querySelectorAll("img[data-img-id]")) {
      const imageEntry = await getImage(img.dataset.imgId);
      if (imageEntry) {
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            img.src = reader.result;
            resolve();
          };
          reader.readAsDataURL(imageEntry.blob);
        });
      }
    }
    return div.innerHTML;
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
        const stripped = stripImageSources(markdown);
        const { ciphertext, iv } = await encryptContent(stripped, key);
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

  // The lock function. Phase 1: if there's a cached key and unsaved edits,
  // flush them to disk using the still-cached key. Phase 2 (unconditional):
  // wipe key, salt, plaintext state, and editor contents. Phase 3: set
  // saveStatus to "locked" so the UI reflects it.
  //
  // The wipe is unconditional — even if the flush throws — because the lock
  // guarantee has to be absolute. An attacker who can cause IndexedDB errors
  // must not be able to prevent the lock from happening.
  const lock = useCallback(async () => {
    clearTimeout(idleTimerRef.current);
    clearTimeout(debounceTimerRef.current);

    const isDirty =
      markdown !== lastSavedRef.current.markdown ||
      title !== lastSavedRef.current.title;

    if (sessionKeyRef.current && sessionSaltRef.current && isDirty) {
      try {
        await persistNote(sessionKeyRef.current, sessionSaltRef.current);
      } catch {
        toast.error("Lock: last save failed, recent edits may be lost.");
      }
    }

    sessionKeyRef.current = null;
    sessionSaltRef.current = null;
    lastSavedRef.current = { markdown: "", title: "" };
    setMarkdown("");
    setTitle("");
    setCurrentId(null);
    if (editorRef.current) editorRef.current.setData("");
    setSaveStatus("locked");
  }, [markdown, title, persistNote, setMarkdown, setTitle, setCurrentId]);

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
        const contentWithImages = await renderImages(decrypted);

        sessionKeyRef.current = key;
        sessionSaltRef.current = salt;
        lastSavedRef.current = {
          markdown: contentWithImages,
          title: selectedNote.title || "",
        };

        setMarkdown(contentWithImages);
        setCurrentId(selectedNote.id);
        setTitle(selectedNote.title || "");
        if (editorRef.current) editorRef.current.setData(contentWithImages);
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
      if (editorRef.current) editorRef.current.setData("");
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
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to read image"));
        reader.readAsDataURL(file);
      });
      const html = `<figure class="image"><img src="${dataUrl}" data-img-id="${id}" style="max-width:100%;" /></figure>`;
      if (editorRef.current) {
        editorRef.current.setData(editorRef.current.getData() + html);
        setMarkdown(editorRef.current.getData());
      }
      toast.success("Image attached!");
    } catch (err) {
      toast.error("Failed to attach image: " + err.message);
    }
  };

  // First-edit passphrase prompt for brand-new notes. As soon as the user has
  // typed both a title and some content into a never-saved note, prompt for a
  // passphrase, derive a key, persist immediately, and cache the key. From
  // that moment on the new note behaves exactly like any other unlocked note:
  // auto-save fires, idle-lock flushes-then-wipes, etc.
  //
  // Using a ref guard (isPromptingRef) so the effect doesn't re-open the
  // modal on every keystroke while the user is mid-prompt.
  useEffect(() => {
    if (currentId) return;
    if (sessionKeyRef.current) return;
    if (isPromptingRef.current) return;
    if (!markdown.trim() || !title.trim()) return;

    isPromptingRef.current = true;
    (async () => {
      try {
        const pw = await askPassphrase("encrypt");
        const salt = generateSalt();
        const key = await deriveKey(pw, salt);
        await persistNote(key, salt);
        sessionKeyRef.current = key;
        sessionSaltRef.current = salt;
        toast.success("Encrypted & auto-saving");
      } catch (err) {
        if (err.message !== "cancelled" && err.message !== "superseded") {
          toast.error(err.message);
        }
      } finally {
        isPromptingRef.current = false;
      }
    })();
  }, [markdown, title, currentId, askPassphrase, persistNote]);

  // Debounced auto-save: when markdown/title change and the note is unlocked,
  // schedule a save 1.5s after the last edit. The save itself is silent.
  useEffect(() => {
    if (!sessionKeyRef.current) return;
    const isDirty =
      markdown !== lastSavedRef.current.markdown ||
      title !== lastSavedRef.current.title;
    if (!isDirty) return;
    if (!markdown.trim() || !title.trim()) return;

    setSaveStatus("dirty");
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      autoSave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(debounceTimerRef.current);
  }, [markdown, title, autoSave]);

  // Idle auto-lock: any keystroke (markdown/title change) resets a 5-minute
  // timer. When it fires, lock() runs (which flushes-then-wipes).
  useEffect(() => {
    if (!sessionKeyRef.current) return;
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      lock();
      toast("Locked due to inactivity", { icon: "🔒" });
    }, IDLE_LOCK_MS);
    return () => clearTimeout(idleTimerRef.current);
  }, [markdown, title, lock]);

  // Tab-hide and unload locks. visibilitychange fires when the user switches
  // tabs or minimizes; pagehide fires when the page is being torn down.
  // Both call lock(), which flushes-then-wipes. We also wire beforeunload to
  // surface the browser's native "unsaved changes" dialog if there's anything
  // dirty in memory that we couldn't flush (e.g. a brand-new note with no key).
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && sessionKeyRef.current) {
        lock();
      }
    };
    const onPageHide = () => {
      if (sessionKeyRef.current) lock();
    };
    const onBeforeUnload = (e) => {
      const isDirty =
        markdown !== lastSavedRef.current.markdown ||
        title !== lastSavedRef.current.title;
      if (isDirty) {
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
  }, [lock, markdown, title]);

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
          {sessionKeyRef.current && (
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

          <CKEditor
            editor={ClassicEditor}
            data={markdown}
            onReady={(editor) => (editorRef.current = editor)}
            onChange={(_event, editor) => setMarkdown(editor.getData())}
            config={{
              toolbar: [
                "heading",
                "|",
                "bold",
                "italic",
                "link",
                "bulletedList",
                "numberedList",
                "blockQuote",
                "undo",
                "redo",
              ],
            }}
          />

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
