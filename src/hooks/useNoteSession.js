import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuid4 } from "uuid";
import toast from "react-hot-toast";
import {
  saveNote,
  getAllNotes,
  getNote,
  deleteNote as dbDeleteNote,
  deleteImage,
} from "../js/db";
import {
  deriveKey,
  encryptContent,
  decryptContent,
  generateSalt,
} from "../js/crypto";

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

// Owns the encrypted-note lifecycle: session key/salt cache, persist,
// auto-save, idle lock, tab-hide lock, and unlock/save/delete handlers.
//
// The host component is responsible for: rendering the editor, owning the
// markdown/title/currentId state (passed in), supplying an `askPassphrase`
// function (typically from useModalQueue), and toasting around the manual
// save/delete handlers.
export function useNoteSession({
  markdown,
  title,
  currentId,
  setMarkdown,
  setTitle,
  setCurrentId,
  setNotes,
  askPassphrase,
}) {
  // sessionKeyRef holds the non-extractable AES-GCM CryptoKey for the
  // current unlocked note. sessionSaltRef holds the salt that key was
  // derived against (frozen for the lifetime of this unlock — we only
  // roll the salt when the user explicitly changes passphrase).
  // lastSavedRef tracks the last successfully-persisted markdown/title pair
  // so we know when there's something to flush.
  const sessionKeyRef = useRef(null);
  const sessionSaltRef = useRef(null);
  const lastSavedRef = useRef({ markdown: "", title: "" });
  const isSavingRef = useRef(false);
  const idleTimerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // "idle" | "dirty" | "saving" | "saved" | "locked"
  const [saveStatus, setSaveStatus] = useState("idle");

  const isUnlocked = useCallback(
    () => !!(sessionKeyRef.current && sessionSaltRef.current),
    [],
  );

  const isDirty = useCallback(
    () =>
      markdown !== lastSavedRef.current.markdown ||
      title !== lastSavedRef.current.title,
    [markdown, title],
  );

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

        // GC images that were removed from the note since last save.
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
  // unlocked. Brand-new notes have no key and are skipped — the user must
  // perform a manual save first.
  const autoSave = useCallback(async () => {
    if (!isUnlocked()) return;
    try {
      await persistNote(sessionKeyRef.current, sessionSaltRef.current);
    } catch {
      // swallow — status indicator already shows "dirty"
    }
  }, [persistNote, isUnlocked]);

  // Wipe everything in memory. Always safe to call.
  const wipeSession = useCallback(() => {
    sessionKeyRef.current = null;
    sessionSaltRef.current = null;
    lastSavedRef.current = { markdown: "", title: "" };
    setMarkdown("");
    setTitle("");
    setCurrentId(null);
    setSaveStatus("locked");
  }, [setMarkdown, setTitle, setCurrentId]);

  // Three branches depending on what's in memory:
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

    const dirty = isDirty();

    // Branch 1: existing unlocked note with edits.
    if (isUnlocked()) {
      if (dirty) {
        try {
          await persistNote(sessionKeyRef.current, sessionSaltRef.current);
        } catch {
          toast.error("Lock: last save failed, recent edits may be lost.");
        }
      }
      wipeSession();
      return;
    }

    // Branch 2: brand-new note that has content but no key yet.
    if (!currentId && dirty && markdown.trim() && title.trim()) {
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
  }, [
    markdown,
    title,
    currentId,
    persistNote,
    wipeSession,
    askPassphrase,
    isUnlocked,
    isDirty,
  ]);

  // Load + decrypt a note. On success, cache the derived key and salt so
  // subsequent edits auto-save without re-prompting.
  const unlockExisting = useCallback(
    async (selectedNote) => {
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
    },
    [askPassphrase, setMarkdown, setCurrentId, setTitle],
  );

  // Manual Save button. For a brand-new note (no cached key) it prompts for a
  // passphrase, derives a key, persists, and *caches* the key — from this
  // moment on the note is "warm" and auto-save will run silently. For an
  // already-unlocked note this is just a forced flush.
  const saveManual = useCallback(async () => {
    if (isUnlocked()) {
      await persistNote(sessionKeyRef.current, sessionSaltRef.current);
      return "saved";
    }
    const pw = await askPassphrase("encrypt");
    const salt = generateSalt();
    const key = await deriveKey(pw, salt);
    await persistNote(key, salt);
    sessionKeyRef.current = key;
    sessionSaltRef.current = salt;
    return "encrypted";
  }, [persistNote, askPassphrase, isUnlocked]);

  // Delete the current note. Requires re-deriving from a user-supplied
  // passphrase against the note's stored salt and successfully decrypting the
  // existing ciphertext — this protects against an attacker walking up to an
  // unlocked editor and wiping notes.
  const deleteCurrent = useCallback(async () => {
    if (!currentId) throw new Error("No note selected!");
    const note = await getNote(currentId);
    if (!note) throw new Error("Note not found");

    const pw = await askPassphrase("decrypt");
    const verifyKey = await deriveKey(pw, new Uint8Array(note.salt));
    await decryptContent(
      new Uint8Array(note.ciphertext),
      verifyKey,
      new Uint8Array(note.iv),
    );

    if (note?.imageIds?.length) {
      await Promise.all(note.imageIds.map((id) => deleteImage(id)));
    }
    await dbDeleteNote(currentId);

    sessionKeyRef.current = null;
    sessionSaltRef.current = null;
    lastSavedRef.current = { markdown: "", title: "" };

    setMarkdown("");
    setTitle("");
    setCurrentId(null);
    setNotes(await getAllNotes());
    setSaveStatus("idle");
  }, [
    currentId,
    askPassphrase,
    setMarkdown,
    setTitle,
    setCurrentId,
    setNotes,
  ]);

  // Debounced auto-save / dirty indicator. Two cases:
  //   - Unlocked existing note (cached key): mark dirty, schedule a silent
  //     background save 1.5s after the last edit.
  //   - Brand-new note (no key): mark dirty so the UI matches the unlocked
  //     experience. We can't actually persist without a passphrase, so the
  //     real save happens at lock time (idle timer / Lock button / tab-hide).
  useEffect(() => {
    if (!isDirty()) return;
    if (!markdown.trim() || !title.trim()) return;

    setSaveStatus("dirty");

    if (!sessionKeyRef.current) return; // new note: no background save
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      autoSave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(debounceTimerRef.current);
  }, [markdown, title, autoSave, isDirty]);

  // Idle auto-lock: any keystroke resets a 5-minute timer. We arm in two cases:
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
  // pagehide can't show a modal (the page is going away), so for new notes
  // we rely on beforeunload's native browser dialog as the safety net.
  useEffect(() => {
    const isDirtyNow = () =>
      markdown !== lastSavedRef.current.markdown ||
      title !== lastSavedRef.current.title;
    const hasNewNoteDraft = () =>
      !currentId && markdown.trim() && title.trim() && isDirtyNow();

    const onVisibility = () => {
      if (!document.hidden) return;
      if (sessionKeyRef.current || hasNewNoteDraft()) {
        lock();
      }
    };
    const onPageHide = () => {
      if (sessionKeyRef.current) lock();
    };
    const onBeforeUnload = (e) => {
      if (isDirtyNow()) {
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

  return {
    saveStatus,
    isUnlocked,
    lock,
    unlockExisting,
    saveManual,
    deleteCurrent,
  };
}
