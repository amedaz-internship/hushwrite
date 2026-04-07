import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Plus, Lock, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const Sidebar = ({
  setMarkdown,
  setCurrentId,
  notes,
  onSelectNote,
  currentId,
}) => {
  const newNote = () => {
    setMarkdown("");
    setCurrentId(null);
    onSelectNote(null);
    toast.success("New note created!");
  };

  return (
    <aside className="flex h-screen w-72 flex-col gap-5 border-r border-zinc-800 bg-zinc-950 p-5 text-zinc-100">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
          <Lock className="h-4 w-4 text-primary" />
        </div>
        <div className="leading-tight">
          <h2 className="text-base font-semibold tracking-tight text-zinc-50">
            HushWrite
          </h2>
          <p className="text-[11px] text-zinc-500">Encrypted notes</p>
        </div>
      </div>

      <Button onClick={newNote} className="w-full shadow-sm">
        <Plus className="mr-2 h-4 w-4" />
        New Note
      </Button>

      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Notes
        </span>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
          {notes.length}
        </span>
      </div>

      <div className="scrollbar-thin -mx-1 flex flex-1 flex-col gap-1.5 overflow-y-auto px-1 pb-2">
        {notes.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 px-3 py-8 text-center">
            <FileText className="h-5 w-5 text-zinc-600" />
            <p className="text-xs text-zinc-500">No saved notes yet</p>
          </div>
        )}

        {notes.map((note) => {
          const isActive = note.id === currentId;
          return (
            <button
              key={note.id}
              onClick={() => onSelectNote(note)}
              className={cn(
                "group flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-all",
                isActive
                  ? "border-primary/40 bg-primary/10 shadow-sm"
                  : "border-transparent bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900",
              )}
            >
              <div className="flex w-full items-center gap-1.5">
                <Lock
                  className={cn(
                    "h-3 w-3 shrink-0",
                    isActive ? "text-primary" : "text-zinc-600",
                  )}
                />
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    isActive ? "text-zinc-50" : "text-zinc-200",
                  )}
                >
                  {note.title || "Untitled Note"}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500">
                {new Date(
                  note.updatedAt || note.createdAt,
                ).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-zinc-800 pt-3 text-[10px] text-zinc-600">
        Locally encrypted · Offline-first
      </div>
    </aside>
  );
};

export default Sidebar;
