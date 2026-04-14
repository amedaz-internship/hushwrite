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
const IDLE_LOCK_MS = 3 * 60 * 1000;


const IDB_IMG_REGEX = /!\[[^\]]*\]\(idb:\/\/([0-9a-f-]+)\)/gi;
const extractImageIds = (md) => {
  const ids = [];
  for (const m of md.matchAll(IDB_IMG_REGEX)) ids.push(m[1]);
  return ids;
};
const toBytes = (v) => (v instanceof Uint8Array ? v : new Uint8Array(v));
const isQuietErr = (err) =>
  err?.message === "cancelled" || err?.message === "superseded";
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
  const sessionKeyRef = useRef(null);
  const sessionSaltRef = useRef(null);
  const lastSavedRef = useRef({ markdown: "", title: "" });
  const isSavingRef = useRef(false);
  const idleTimerRef = useRef(null);
  const debounceTimerRef = useRef(null);


  const [saveStatus, setSaveStatus] = useState("idle");
  const [unlockError, setUnlockError] = useState(null);

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
  const persistNote = useCallback(
    async (key, salt) => {
      if (isSavingRef.current) return false;
      if (!markdown.trim() || !title.trim()) return false;

      isSavingRef.current = true;
      setSaveStatus("saving");
      try {
   
        const trimmedTitle = title.trim();
        const { ciphertext, iv } = await encryptContent(markdown, key);
        const { ciphertext: titleCiphertext, iv: titleIv } =
          await encryptContent(trimmedTitle, key);
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
          ciphertext,
          iv,
          salt,
          titleCiphertext,
          titleIv,
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

  
  // Lock the session without yanking the note out of the sidebar.
  // We persist any pending edits, drop the encryption key + plaintext from
  // memory, but keep `currentId` so the note stays selected and the user can
  // re-enter their passphrase to resume editing.
  const lockKeepSelected = useCallback(() => {
    sessionKeyRef.current = null;
    sessionSaltRef.current = null;
    lastSavedRef.current = { markdown: "", title: "" };
    setMarkdown("");
    setTitle("");
    setSaveStatus("locked");
  }, [setMarkdown, setTitle]);

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
      lockKeepSelected();
      return;
    }

    // Branch 2: brand-new note that has content but no key yet.
    if (!currentId && dirty && markdown.trim() && title.trim()) {
      try {
        const pw = await askPassphrase("encrypt");
        const salt = generateSalt();
        const key = await deriveKey(pw, salt);
        await persistNote(key, salt);
        lockKeepSelected();
      } catch (err) {
        if (!isQuietErr(err)) toast.error(err.message);
        // Cancelled or failed: drop the plaintext draft entirely.
        wipeSession();
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
    lockKeepSelected,
    askPassphrase,
    isUnlocked,
    isDirty,
  ]);


  const unlockExisting = useCallback(
    async (selectedNote) => {
      const pw = await askPassphrase("decrypt");
      const salt = toBytes(selectedNote.salt);
      const key = await deriveKey(pw, salt);
      const decrypted = await decryptContent(
        toBytes(selectedNote.ciphertext),
        key,
        toBytes(selectedNote.iv),
      );

      let decryptedTitle = selectedNote.title || "";
      if (selectedNote.titleCiphertext && selectedNote.titleIv) {
        decryptedTitle = await decryptContent(
          toBytes(selectedNote.titleCiphertext),
          key,
          toBytes(selectedNote.titleIv),
        );
      }

      sessionKeyRef.current = key;
      sessionSaltRef.current = salt;
      lastSavedRef.current = {
        markdown: decrypted,
        title: decryptedTitle,
      };

      setMarkdown(decrypted);
      setCurrentId(selectedNote.id);
      setTitle(decryptedTitle);
      setSaveStatus("saved");
      setUnlockError(null);
    },
    [askPassphrase, setMarkdown, setCurrentId, setTitle],
  );

  // Re-prompt for the passphrase on the currently-selected (locked) note and
  // restore its plaintext into the editor.
  const unlockCurrent = useCallback(async () => {
    if (isUnlocked()) return;
    if (!currentId) return;
    const note = await getNote(currentId);
    if (!note) return;
    try {
      await unlockExisting(note);
    } catch (err) {
      if (!isQuietErr(err)) setUnlockError(err.message);
      throw err;
    }
  }, [currentId, isUnlocked, unlockExisting]);

  // Switch the editor to a different note: lock+autosave the current one,
  // move the sidebar highlight immediately, then prompt for the new note's
  // passphrase. Wrong passphrase leaves the note in the locked-card UI with
  // an error message instead of bouncing back to the prior note.
  const switchToNote = useCallback(
    async (note) => {
      if (!note) return;
      if (note.id === currentId && isUnlocked()) return;

      clearTimeout(idleTimerRef.current);
      clearTimeout(debounceTimerRef.current);

      if (isUnlocked() && isDirty()) {
        try {
          await persistNote(sessionKeyRef.current, sessionSaltRef.current);
        } catch {
          toast.error("Could not save current note before switching.");
        }
      }

      sessionKeyRef.current = null;
      sessionSaltRef.current = null;
      lastSavedRef.current = { markdown: "", title: "" };
      setMarkdown("");
      setTitle("");
      setCurrentId(note.id);
      setSaveStatus("locked");
      setUnlockError(null);

      try {
        await unlockExisting(note);
      } catch (err) {
        if (!isQuietErr(err)) setUnlockError(err.message);
        throw err;
      }
    },
    [
      currentId,
      isUnlocked,
      isDirty,
      persistNote,
      setMarkdown,
      setTitle,
      setCurrentId,
      unlockExisting,
    ],
  );

  const saveManual = useCallback(async () => {
    // Existing notes reuse their own derived key+salt — we can't change
    // the passphrase of an already-encrypted note through a normal save.
    if (isUnlocked() && currentId) {
      await persistNote(sessionKeyRef.current, sessionSaltRef.current);
      return "saved";
    }
    // New notes (no id yet) always prompt for a passphrase so each note
    // can have its own, independent of any other note that happens to be
    // unlocked in the current session.
    const pw = await askPassphrase("encrypt");
    const salt = generateSalt();
    const key = await deriveKey(pw, salt);
    await persistNote(key, salt);
    sessionKeyRef.current = key;
    sessionSaltRef.current = salt;
    return "encrypted";
  }, [persistNote, askPassphrase, isUnlocked, currentId]);


  const deleteCurrent = useCallback(async () => {
    if (!currentId) throw new Error("No note selected!");
    const note = await getNote(currentId);
    if (!note) throw new Error("Note not found");

    const pw = await askPassphrase("decrypt");
    const verifyKey = await deriveKey(pw, toBytes(note.salt));
    await decryptContent(
      toBytes(note.ciphertext),
      verifyKey,
      toBytes(note.iv),
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

  
  useEffect(() => {
    if (!isDirty()) return;
    if (!markdown.trim() || !title.trim()) return;

    setSaveStatus("dirty");

    // Only auto-save when we're editing a note that already exists in the
    // store (has an id) AND the session key matches that note. New drafts
    // never background-save — they wait for a manual save so the user can
    // provide a fresh passphrase for the new note.
    if (!sessionKeyRef.current || !currentId) return;
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      autoSave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(debounceTimerRef.current);
  }, [markdown, title, currentId, autoSave, isDirty]);


  useEffect(() => {
    const hasContent = markdown.trim() && title.trim();
    const armed = sessionKeyRef.current || (!currentId && hasContent);
    if (!armed) return;

    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(async () => {
      await lock();
      toast("Locked due to inactivity. Enter your passphrase to continue.", {
        icon: "🔒",
      });
      if (!document.hidden) {
        unlockCurrent().catch(() => {
          // Surfaced inside the locked-card UI via unlockError.
        });
      }
    }, IDLE_LOCK_MS);
    return () => clearTimeout(idleTimerRef.current);
  }, [markdown, title, currentId, lock, unlockCurrent]);

   
  useEffect(() => {
    const isDirtyNow = () =>
      markdown !== lastSavedRef.current.markdown ||
      title !== lastSavedRef.current.title;
    const hasNewNoteDraft = () =>
      !currentId && markdown.trim() && title.trim() && isDirtyNow();

    const onVisibility = () => {
      if (document.hidden) {
        if (sessionKeyRef.current || hasNewNoteDraft()) {
          lock();
        }
        return;
      }
      // Returning to the tab while locked → re-prompt for the passphrase so
      // the user can resume the note they had open.
      if (!sessionKeyRef.current && currentId) {
        unlockCurrent().catch(() => {
          // Surfaced inside the locked-card UI via unlockError.
        });
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
  }, [lock, unlockCurrent, markdown, title, currentId]);

  return {
    saveStatus,
    unlockError,
    isUnlocked,
    lock,
    unlockExisting,
    unlockCurrent,
    switchToNote,
    saveManual,
    deleteCurrent,
  };
}
