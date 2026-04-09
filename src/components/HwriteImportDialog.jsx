import { useEffect, useRef, useState } from "react";
import { FileInput, Lock, Unlock, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Two-step import dialog:
//   step "preview"    → show metadata, ask user to confirm
//   step "passphrase" → only for encrypted files, prompt + decrypt
//
// On wrong passphrase the modal stays open, shakes the input, and re-focuses
// it instead of dumping the user back to the sidebar.
const HwriteImportDialog = ({
  parsed,
  fileSize,
  // async function (passphrase|undefined) -> markdown
  // throws on wrong passphrase / decrypt error
  onDecrypt,
  onConfirm,
  onCancel,
}) => {
  const [step, setStep] = useState("preview");
  const [passphrase, setPassphrase] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (step !== "passphrase") return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [step]);

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
    if (parsed.encrypted) {
      setStep("passphrase");
      return;
    }
    // Plaintext: decrypt is a no-op, just hand back content.
    setBusy(true);
    try {
      const md = await onDecrypt(undefined);
      onConfirm({ markdown: md, title: parsed.title });
    } catch (err) {
      setError(err.message || "Failed to import file.");
      setBusy(false);
    }
  };

  const handleSubmitPassphrase = async () => {
    if (!passphrase || busy) return;
    setBusy(true);
    setError("");
    try {
      const md = await onDecrypt(passphrase);
      onConfirm({ markdown: md, title: parsed.title });
    } catch {
      // Generic error — don't distinguish wrong-key from tamper.
      setError("Wrong passphrase, or file is corrupted.");
      setShake(true);
      setPassphrase("");
      setBusy(false);
      setTimeout(() => setShake(false), 400);
      setTimeout(() => inputRef.current?.focus(), 50);
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
            <DialogTitle>
              {step === "preview" ? "Import .hwrite file" : "Decrypt file"}
            </DialogTitle>
            <DialogDescription>
              {step === "preview"
                ? "Review the file before adding it to your notes."
                : "Enter the passphrase used when this file was exported."}
            </DialogDescription>
          </DialogHeader>
        </div>

        {step === "preview" && (
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
              The note will be loaded into the editor as a new draft. Save it
              with your own passphrase to add it to your library.
            </p>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>
        )}

        {step === "passphrase" && (
          <div className={"flex flex-col gap-2 " + (shake ? "animate-shake" : "")}>
            <div className="relative">
              <Input
                ref={inputRef}
                type={showPass ? "text" : "password"}
                placeholder="Passphrase…"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmitPassphrase()}
                disabled={busy}
                className="bg-background pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? "Hide passphrase" : "Show passphrase"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                {showPass ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          {step === "preview" ? (
            <Button onClick={handleConfirmPreview} disabled={busy}>
              {parsed.encrypted ? "Continue" : "Import"}
            </Button>
          ) : (
            <Button
              onClick={handleSubmitPassphrase}
              disabled={busy || !passphrase}
            >
              Decrypt & Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HwriteImportDialog;
