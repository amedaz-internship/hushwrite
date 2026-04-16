import { useState } from "react";
import { FileInput, Lock, Unlock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Single-step import dialog: show metadata, user confirms.
// Encrypted files are stored as-is — the export passphrase is asked for only
// when the note is later opened in the editor.
const HwriteImportDialog = ({
  parsed,
  fileSize,
  onConfirm,
  onCancel,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fmtDate = (iso) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };
  const fmtSize = (bytes) => {
    if (!bytes && bytes !== 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const handleConfirmPreview = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message || "Failed to import file.");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent>
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <FileInput className="h-5 w-5 text-primary" />
          </div>
          <DialogHeader>
            <DialogTitle>Import .hwrite file</DialogTitle>
            <DialogDescription>
              {parsed.encrypted
                ? "The file stays encrypted in your library. You'll be asked for its passphrase the first time you open it."
                : "Review the file before adding it to your notes."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Title
                </div>
                <div className="truncate text-base font-semibold">
                  {parsed.title || "Untitled"}
                </div>
              </div>
              <span
                className={
                  "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
                  (parsed.encrypted
                    ? "bg-primary/15 text-primary"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400")
                }
              >
                {parsed.encrypted ? (
                  <>
                    <Lock className="h-3 w-3" /> Encrypted
                  </>
                ) : (
                  <>
                    <Unlock className="h-3 w-3" /> Plaintext
                  </>
                )}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div>
                <div className="uppercase tracking-wider">Created</div>
                <div className="text-foreground">{fmtDate(parsed.created)}</div>
              </div>
              <div>
                <div className="uppercase tracking-wider">Modified</div>
                <div className="text-foreground">{fmtDate(parsed.modified)}</div>
              </div>
              <div>
                <div className="uppercase tracking-wider">Size</div>
                <div className="text-foreground">{fmtSize(fileSize)}</div>
              </div>
              <div>
                <div className="uppercase tracking-wider">Format</div>
                <div className="text-foreground">.hwrite v{parsed.hwrite}</div>
              </div>
            </div>

            <p className="rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
              {parsed.encrypted
                ? "Stored encrypted in your library. The export passphrase will be required the first time you open it."
                : "Loaded into the editor as a new draft. Save it with your own passphrase to add it to your library."}
            </p>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirmPreview} disabled={busy}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HwriteImportDialog;
