import { useEffect, useRef } from "react";
import MDEditor, { commands as mdCommands } from "@uiw/react-md-editor";
import toast from "react-hot-toast";
import { v4 as uuid4 } from "uuid";
import IdbImage from "./IdbImage.jsx";
import Preview from "./Preview.jsx";
import ExportNote from "./ExportNotes.jsx";
import PassphraseModal from "./PassPhraseModal.jsx";
import DeleteModal from "./DeleteModal.jsx";
import { useTheme } from "@/lib/theme.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Save,
  Trash2,
  ImagePlus,
  FileText,
  Lock,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { saveImage } from "../js/db";
import { useModalQueue } from "@/hooks/useModalQueue";
import { useNoteSession } from "@/hooks/useNoteSession";

const SaveStatusLabel = ({ status }) => {
  switch (status) {
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
  setNotes,
}) => {
  const fileInputRef = useRef(null);
  const { theme } = useTheme();

  const { modal, open: openModal, confirm, cancel } = useModalQueue();
  const askPassphrase = (mode) => openModal({ type: "passphrase", mode });
  const askDeleteConfirm = () => openModal({ type: "delete" });

  const {
    saveStatus,
    isUnlocked,
    lock,
    unlockExisting,
    saveManual,
    deleteCurrent,
  } = useNoteSession({
    markdown,
    title,
    currentId,
    setMarkdown,
    setTitle,
    setCurrentId,
    setNotes,
    askPassphrase,
  });

  useEffect(() => {
    if (!currentId) setTitle("");
  }, [currentId, setTitle]);

  // Decrypt and load whichever note the sidebar selected.
  useEffect(() => {
    if (!selectedNote) return;
    (async () => {
      try {
        await unlockExisting(selectedNote);
        toast.success("Note unlocked");
      } catch (err) {
        if (!isQuietError(err)) toast.error(err.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote]);

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
      const result = await saveManual();
      toast.success(result === "encrypted" ? "Encrypted & saved" : "Saved");
    } catch (err) {
      if (!isQuietError(err)) toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!currentId) {
      toast.error("No note selected!");
      return;
    }
    try {
      await askDeleteConfirm();
      await deleteCurrent();
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

  const onLockClick = () => {
    lock();
    toast("Locked", { icon: "🔒" });
  };

  const showLockButton =
    isUnlocked() || (!currentId && markdown.trim() && title.trim());

  return (
    <main className="scrollbar-thin flex h-screen flex-1 flex-col overflow-y-auto">
      {modal?.type === "passphrase" && (
        <PassphraseModal
          mode={modal.mode}
          onConfirm={confirm}
          onCancel={cancel}
        />
      )}
      {modal?.type === "delete" && (
        <DeleteModal onConfirm={() => confirm(true)} onCancel={cancel} />
      )}

      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/80 px-8 py-4 backdrop-blur">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>{currentId ? "Editing note" : "New note"}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <SaveStatusLabel status={saveStatus} />
          {showLockButton && (
            <Button variant="ghost" size="sm" onClick={onLockClick}>
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
