import { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { parseHwrite, decryptHwrite } from "../js/hwrite";
import HwriteImportDialog from "./HwriteImportDialog";

const Icon = ({ name, className }) => (
  <span className={cn("material-symbols-outlined", className)}>{name}</span>
);

const formatTimestamp = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const sameYear = d.getFullYear() === now.getFullYear();
  if (diff < 1000 * 60 * 60 * 48) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
};

const NoteList = ({
  notes,
  currentId,
  currentTitle,
  titleCache = {},
  onSelectNote,
  onImportNote,
  searchInputRef,
}) => {
  const fileInputRef = useRef(null);
  const [importState, setImportState] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [query, setQuery] = useState("");

  const handleHwriteFile = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = await parseHwrite(text);
      setImportState({ parsed, fileSize: file.size });
    } catch (err) {
      toast.error(err.message || "Could not read .hwrite file");
    }
  };

  const onFilePick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    handleHwriteFile(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".hwrite")) {
      toast.error("Only .hwrite files can be imported.");
      return;
    }
    handleHwriteFile(file);
  };

  // Resolve the best-known plaintext title for a note. For the active
  // note we prefer the live editor title, but fall back to the session
  // cache when it's empty (the editor title is temporarily blanked while
  // we wait for the user to re-enter the passphrase on a locked note —
  // the sidebar label should stay stable across that transition).
  const resolveTitle = (note) => {
    if (note.id === currentId) {
      return (currentTitle && currentTitle.trim())
        ? currentTitle
        : titleCache[note.id] || note.title || null;
    }
    return titleCache[note.id] || note.title || null;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => (resolveTitle(n) || "").toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, query, currentId, currentTitle, titleCache]);

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragActive) setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragActive(false);
      }}
      onDrop={onDrop}
      className={cn(
        "relative flex w-80 flex-col border-r border-outline-variant/10 bg-surface-container-low",
        dragActive && "ring-2 ring-vault-primary/60 ring-inset",
      )}
    >
      <div className="border-b border-outline-variant/10 p-4">
        <div className="relative">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-outline"
          />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full rounded-lg border border-transparent bg-surface-container py-2 pl-10 pr-4 text-sm text-on-surface placeholder-outline transition-all focus:border-vault-primary/50 focus:outline-none focus:ring-0"
          />
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-surface-container py-2 text-xs font-medium text-outline transition-all hover:bg-surface-container-high hover:text-on-surface"
        >
          <Icon name="file_upload" className="text-sm" />
          Import .hwrite
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".hwrite,application/json"
          hidden
          onChange={onFilePick}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Icon
              name={query ? "search_off" : "description"}
              className="text-2xl text-outline/60"
            />
            <p className="text-xs text-outline">
              {query ? "No matches" : "No saved notes yet"}
            </p>
          </div>
        )}

        {filtered.map((note) => {
          const isActive = note.id === currentId;
          const resolved = resolveTitle(note);
          const displayTitle =
            resolved && resolved.trim()
              ? resolved
              : isActive
                ? "Untitled note"
                : "Encrypted note";
          const isEncrypted = !resolved && !isActive;
          const preview = isEncrypted ? "Locked — unlock to view contents" : "";
          return (
            <button
              key={note.id}
              onClick={() => onSelectNote(note)}
              className={cn(
                "block w-full cursor-pointer border-l-2 p-4 text-left transition-all",
                isActive
                  ? "border-vault-primary bg-surface-container-high/50"
                  : "border-transparent hover:bg-surface-container",
              )}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="truncate text-sm font-semibold text-on-surface">
                  {displayTitle}
                </h3>
                <span className="whitespace-nowrap text-[10px] text-outline">
                  {formatTimestamp(note.updatedAt || note.createdAt)}
                </span>
              </div>
              {preview && (
                <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-on-surface-variant">
                  {preview}
                </p>
              )}
              <div className="flex gap-2">
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    isActive
                      ? "bg-primary-container/20 text-vault-primary"
                      : "bg-surface-container-highest text-on-surface-variant",
                  )}
                >
                  {isActive ? "Open" : isEncrypted ? "Encrypted" : "Locked"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {dragActive && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/60 text-xs font-medium text-vault-primary backdrop-blur-sm">
          Drop .hwrite file to import
        </div>
      )}

      {importState && (
        <HwriteImportDialog
          parsed={importState.parsed}
          fileSize={importState.fileSize}
          onDecrypt={(pw) => decryptHwrite(importState.parsed, pw)}
          onConfirm={({ markdown, title }) => {
            setImportState(null);
            onImportNote?.({ markdown, title });
          }}
          onCancel={() => setImportState(null)}
        />
      )}
    </section>
  );
};

export default NoteList;
