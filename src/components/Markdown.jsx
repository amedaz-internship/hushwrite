import { useEffect, useMemo, useRef, useState } from "react";
import MDEditor, { commands as mdCommands } from "@uiw/react-md-editor";
import toast from "react-hot-toast";
import { v4 as uuid4 } from "uuid";
import IdbImage from "./IdbImage.jsx";
import Preview from "./Preview.jsx";
import ExportNote from "./ExportNotes.jsx";
import PassphraseModal from "./PassPhraseModal.jsx";
import DeleteModal from "./DeleteModal.jsx";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme.jsx";
import {
  saveImage,
  getNote,
  deleteNote as dbDeleteNote,
  deleteImage,
  getAllNotes,
} from "../js/db";
import { deriveKey, decryptContent } from "../js/crypto";

const toBytes = (v) => (v instanceof Uint8Array ? v : new Uint8Array(v));
import { useModalQueue } from "@/hooks/useModalQueue";
import { useNoteSession } from "@/hooks/useNoteSession";
import { useVault } from "@/lib/vault";

const Icon = ({ name, className, fill }) => (
  <span
    className={cn("material-symbols-outlined", className)}
    style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
  >
    {name}
  </span>
);

const SaveStatus = ({ status }) => {
  switch (status) {
    case "saving":
      return (
        <div className="flex items-center gap-1.5 text-on-surface-variant">
          <Icon name="progress_activity" className="animate-spin text-sm" />
          <span>SAVING…</span>
        </div>
      );
    case "saved":
      return (
        <div className="flex items-center gap-1.5 text-on-surface-variant">
          <Icon name="check_circle" className="text-sm" fill />
          <span>SAVED TO VAULT</span>
        </div>
      );
    case "dirty":
      return (
        <div className="flex items-center gap-1.5 text-tertiary">
          <Icon name="edit" className="text-sm" />
          <span>UNSAVED</span>
        </div>
      );
    case "locked":
      return (
        <div className="flex items-center gap-1.5 text-outline">
          <Icon name="lock" className="text-sm" />
          <span>LOCKED</span>
        </div>
      );
    default:
      return null;
  }
};

const isQuietError = (err) =>
  err?.message === "cancelled" || err?.message === "superseded";

const Markdown = ({
  selectedNote,
  markdown,
  setMarkdown,
  currentId,
  setCurrentId,
  title,
  setTitle,
  notes = [],
  setNotes,
  titleCache = {},
  onLockRef,
  onIsUnlockedRef,
  vaultMode = false,
}) => {
  const fileInputRef = useRef(null);
  const [showPreview, setShowPreview] = useState(true);
  const { theme } = useTheme();
  const { isVaultUnlocked, vaultKey, vaultSalt } = useVault();

  const { modal, open: openModal } = useModalQueue();
  const askPassphrase = (mode) => openModal({ type: "passphrase", mode });
  const askDeleteConfirm = (opts = {}) =>
    openModal({ type: "delete", ...opts });

  const vaultSession =
    vaultMode && isVaultUnlocked ? { key: vaultKey, salt: vaultSalt } : null;

  const {
    saveStatus,
    unlockError,
    isUnlocked,
    lock,
    unlockCurrent,
    switchToNote,
    saveManual,
    deleteCurrent,
    deleteVaultNote,
    forceDeleteCurrent,
  } = useNoteSession({
    markdown,
    title,
    currentId,
    setMarkdown,
    setTitle,
    setCurrentId,
    setNotes,
    askPassphrase,
    vault: vaultSession,
  });

  // Expose lock + unlock-state to TopNav via refs passed from App.
  useEffect(() => {
    if (onLockRef) onLockRef.current = lock;
    if (onIsUnlockedRef) onIsUnlockedRef.current = isUnlocked;
  });

  useEffect(() => {
    if (!currentId) setTitle("");
  }, [currentId, setTitle]);

  useEffect(() => {
    if (!selectedNote) return;
    (async () => {
      try {
        await switchToNote(selectedNote);
        toast.success("Note unlocked");
      } catch (err) {
        if (!isQuietError(err) && err?.message) {
          /* surfaced inside locked card */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote]);

  const wordCount = useMemo(() => {
    const text = (markdown || "").replace(/[#*`>_\-[\]()!]/g, " ").trim();
    if (!text) return 0;
    return text.split(/\s+/).length;
  }, [markdown]);

  const onSave = async () => {
    if (!markdown.trim()) return toast.error("Empty note!");
    if (!title.trim()) return toast.error("Please enter a note title!");
    try {
      const result = await saveManual();
      toast.success(result === "encrypted" ? "Encrypted & saved" : "Saved");
    } catch (err) {
      if (!isQuietError(err)) toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!currentId) return toast.error("No note selected!");
    try {
      const note = await getNote(currentId);
      if (!note) throw new Error("Note not found");
      const ageMs = note.createdAt
        ? Date.now() - new Date(note.createdAt).getTime()
        : 0;
      const canForceDelete = ageMs >= THIRTY_DAYS_MS;

      if (!isUnlocked()) {
        // Locked: no passphrase on hand; only the 30-day grace path can
        // proceed. The dialog shows a confirm-only state with the escape
        // hatch when eligible.
        await askDeleteConfirm({
          requirePassphrase: false,
          canForceDelete,
        });
        if (!canForceDelete) {
          throw new Error(
            "Unlock the note to delete it, or wait until it's 30 days old.",
          );
        }
        if (note.imageIds?.length) {
          await Promise.all(note.imageIds.map((id) => deleteImage(id)));
        }
        await dbDeleteNote(currentId);
        setMarkdown("");
        setTitle("");
        setCurrentId(null);
        setNotes(await getAllNotes());
      } else if (vaultMode) {
        await askDeleteConfirm({ requirePassphrase: false });
        await deleteVaultNote();
      } else {
        // Unlocked non-vault: verify the passphrase inside the dialog so a
        // wrong entry keeps the prompt open with an error, rather than
        // bailing out. The 30-day override is offered inline.
        const result = await askDeleteConfirm({
          requirePassphrase: true,
          canForceDelete,
          verify: async (pw) => {
            const key = await deriveKey(pw, toBytes(note.salt));
            await decryptContent(
              toBytes(note.ciphertext),
              key,
              toBytes(note.iv),
            );
          },
        });
        if (result?.kind === "force") {
          await forceDeleteCurrent();
        } else {
          // Passphrase was already verified inside the modal; deleteCurrent
          // re-verifies defensively but we can safely pass the passphrase.
          await deleteCurrent(result.passphrase);
        }
      }
      toast.success("Note deleted!");
    } catch (err) {
      if (!isQuietError(err)) toast.error(err.message || "Delete failed");
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    try {
      const id = uuid4();
      await saveImage({ id, blob: file });
      const altText = file.name.replace(/\.[^.]+$/, "");
      const snippet = `\n![${altText}](idb://${id})\n`;
      setMarkdown((prev) => (prev || "") + snippet);
      toast.success("Image attached!");
    } catch (err) {
      toast.error("Failed to attach image: " + err.message);
    }
  };

  const isLocked = saveStatus === "locked" && !!currentId && !isUnlocked();

  // A locked note older than 30 days can be deleted without a passphrase.
  // Younger notes force a passphrase verify to prevent casual wipes.
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const currentNoteMeta = notes.find((n) => n.id === currentId);
  const noteAgeMs = currentNoteMeta?.createdAt
    ? Date.now() - new Date(currentNoteMeta.createdAt).getTime()
    : 0;
  const canDeleteWithoutUnlock = noteAgeMs >= THIRTY_DAYS_MS;

  const [inlinePassphrase, setInlinePassphrase] = useState("");
  const [unlockPending, setUnlockPending] = useState(false);

  // Re-arm the passphrase promise whenever the note is locked AND there's
  // no pending modal AND no in-flight unlock attempt. This covers:
  //   - entering the locked state for the first time
  //   - retrying after a wrong-passphrase error
  // It does NOT fire while a key derivation is in progress.
  useEffect(() => {
    if (!isLocked) return;
    if (modal) return;
    if (unlockPending) return;
    unlockCurrent().catch(() => {
      /* unlockError surfaced inline */
    });
  }, [isLocked, modal, unlockPending, unlockCurrent]);

  // If we leave the locked context (e.g. user clicked "New Note" while a
  // passphrase prompt was pending), cancel the stale decrypt promise so
  // the modal dismisses and doesn't bleed into the next screen.
  useEffect(() => {
    if (!isLocked && modal?.type === "passphrase" && modal.mode === "decrypt") {
      modal.cancel?.();
    }
  }, [isLocked, modal]);

  // Clear the pending flag once the attempt resolves (success → isLocked
  // flips off; failure → unlockError updates). The re-arm effect will then
  // open a fresh prompt only if we're still locked.
  const prevUnlockError = useRef(unlockError);
  useEffect(() => {
    if (!unlockPending) return;
    if (!isLocked || unlockError !== prevUnlockError.current) {
      prevUnlockError.current = unlockError;
      setUnlockPending(false);
    }
  }, [isLocked, unlockError, unlockPending]);

  const handleInlineUnlock = (e) => {
    e?.preventDefault?.();
    if (!inlinePassphrase) return;
    prevUnlockError.current = unlockError;
    setUnlockPending(true);
    modal?.confirm?.(inlinePassphrase);
    setInlinePassphrase("");
  };

  // Suppress the passphrase modal for decrypt mode while locked —
  // the inline form in the locked card handles it instead.
  const suppressPassphraseModal =
    modal?.type === "passphrase" && modal.mode === "decrypt" && isLocked;

  return (
    <section className="relative flex flex-1 flex-col bg-surface">
      {modal?.type === "passphrase" && !suppressPassphraseModal && (
        <PassphraseModal
          mode={modal.mode}
          onConfirm={modal.confirm}
          onCancel={modal.cancel}
        />
      )}
      {modal?.type === "delete" && (
        <DeleteModal
          requirePassphrase={modal.requirePassphrase}
          canForceDelete={modal.canForceDelete}
          verify={modal.verify}
          onConfirm={(value) => modal.confirm(value)}
          onCancel={modal.cancel}
        />
      )}

      {/* Toolbar / status bar */}
      <div className="flex h-12 items-center justify-between border-b border-outline-variant/10 px-6">
        <div className="flex items-center gap-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Insert image"
            className="rounded p-1.5 text-outline transition-all hover:bg-surface-container-high hover:text-on-surface"
          >
            <Icon name="image" className="text-xl" />
          </button>
          <div className="mx-1 h-4 w-px bg-outline-variant/30" />
          <ExportNote note={{ content: markdown, title }} />
          {currentId && !isLocked && (
            <>
              <div className="mx-1 h-4 w-px bg-outline-variant/30" />
              <button
                onClick={handleDelete}
                title="Delete note (requires passphrase)"
                className="rounded p-1.5 text-outline transition-all hover:bg-error-container/30 hover:text-error"
              >
                <Icon name="delete" className="text-xl" />
              </button>
            </>
          )}
          <div className="mx-1 h-4 w-px bg-outline-variant/30" />
          <button
            onClick={() => setShowPreview((v) => !v)}
            title={showPreview ? "Hide preview" : "Show preview"}
            className={cn(
              "rounded p-1.5 transition-all hover:bg-surface-container-high",
              showPreview ? "text-vault-primary" : "text-outline hover:text-on-surface",
            )}
          >
            <Icon name="visibility" className="text-xl" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleImageUpload}
          />
        </div>
        <div className="flex items-center gap-4 text-[11px] font-medium text-on-surface-variant">
          <SaveStatus status={saveStatus} />
          <span className="opacity-30">|</span>
          <span>{wordCount.toLocaleString()} WORDS</span>
        </div>
      </div>

      {/* Body */}
      {isLocked ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <form
            onSubmit={handleInlineUnlock}
            className="flex w-full max-w-md flex-col items-center gap-5 rounded-xl bg-surface-container-low p-10 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-container/20 ring-1 ring-vault-primary/30">
              <Icon name="lock" className="text-2xl text-vault-primary" />
            </div>
            <div className="space-y-1">
              {titleCache[currentId] && (
                <p className="text-xs font-semibold uppercase tracking-widest text-vault-primary">
                  {titleCache[currentId]}
                </p>
              )}
              <h3 className="text-lg font-semibold tracking-tight text-on-surface">
                {unlockError ? "Wrong passphrase" : "This note is locked"}
              </h3>
              <p className="text-sm text-on-surface-variant">
                {unlockError
                  ? "That passphrase didn't unlock this note. Try again."
                  : "Enter your passphrase to continue where you left off."}
              </p>
            </div>
            <input
              type="password"
              autoFocus
              value={inlinePassphrase}
              onChange={(e) => setInlinePassphrase(e.target.value)}
              placeholder="Passphrase"
              className={cn(
                "w-full rounded-lg border bg-surface-container px-4 py-2.5 text-sm text-on-surface placeholder-outline transition-all focus:outline-none",
                unlockError
                  ? "border-error/60 focus:border-error"
                  : "border-outline-variant/30 focus:border-vault-primary/60",
              )}
            />
            <button
              type="submit"
              disabled={!inlinePassphrase}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-vault-primary px-5 py-2.5 text-sm font-medium text-on-primary-fixed transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="lock_open" className="text-sm" />
              Unlock note
            </button>
            {canDeleteWithoutUnlock && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1.5 text-xs font-medium text-outline transition-colors hover:text-error"
                title="This note is older than 30 days — can be deleted without a passphrase"
              >
                <Icon name="delete" className="text-sm" />
                Delete without unlocking
              </button>
            )}
          </form>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div
            className={cn(
              "flex flex-col overflow-y-auto px-12 py-12",
              showPreview ? "flex-1 border-r border-outline-variant/10" : "w-full",
            )}
          >
            <div className="mx-auto w-full max-w-3xl">
              <input
                type="text"
                placeholder="Untitled"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mb-8 w-full border-none bg-transparent text-4xl font-bold tracking-tight text-on-surface placeholder-outline-variant outline-none focus:ring-0"
              />
              <div
                data-color-mode={theme}
                className="markdown-editor text-lg leading-relaxed"
              >
                <MDEditor
                  value={markdown}
                  onChange={(val) => setMarkdown(val || "")}
                  height={520}
                  preview="edit"
                  hideToolbar={false}
                  visibleDragbar={false}
                  extraCommands={[]}
                  previewOptions={{ components: { img: IdbImage } }}
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
                  ]}
                />
              </div>
            </div>
          </div>
          {showPreview && (
            <div className="flex w-[42%] flex-col overflow-hidden bg-surface-container-low p-6">
              <Preview markdown={markdown} />
            </div>
          )}
        </div>
      )}

      {/* FAB — save */}
      {!isLocked && (
        <button
          onClick={onSave}
          title="Save to vault"
          className="absolute bottom-8 right-8 flex h-14 w-14 items-center justify-center rounded-full bg-vault-primary text-on-primary-fixed shadow-2xl shadow-vault-primary/20 transition-all hover:scale-105 active:scale-95"
        >
          <Icon name="save" className="text-3xl" fill />
        </button>
      )}
    </section>
  );
};

export default Markdown;
