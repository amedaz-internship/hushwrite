import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Plus, Lock, FileText, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme.jsx";

const Sidebar = ({
  setMarkdown,
  setCurrentId,
  notes,
  onSelectNote,
  currentId,
  currentTitle,
}) => {
  const { theme, toggleTheme } = useTheme();

  const newNote = () => {
    setMarkdown("");
    setCurrentId(null);
    onSelectNote(null);
    toast.success("New note created!");
  };

  return (
    <aside className="flex h-screen w-72 flex-col gap-5 border-r border-sidebar-border bg-sidebar p-5 text-sidebar-foreground">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
            <Lock className="h-4 w-4 text-primary" />
          </div>
          <div className="leading-tight">
            <h2 className="text-base font-semibold tracking-tight">
              HushWrite
            </h2>
            <p className="text-[11px] text-sidebar-muted">Encrypted notes</p>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-item-hover hover:text-sidebar-foreground"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
      </div>

      <Button onClick={newNote} className="w-full shadow-sm">
        <Plus className="mr-2 h-4 w-4" />
        New Note
      </Button>

      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted">
          Notes
        </span>
        <span className="rounded-full bg-sidebar-item px-2 py-0.5 text-[10px] font-medium text-sidebar-muted">
          {notes.length}
        </span>
      </div>

      <div className="scrollbar-thin -mx-1 flex flex-1 flex-col gap-1.5 overflow-y-auto px-1 pb-2">
        {notes.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-sidebar-border px-3 py-8 text-center">
            <FileText className="h-5 w-5 text-sidebar-muted" />
            <p className="text-xs text-sidebar-muted">No saved notes yet</p>
          </div>
        )}

        {notes.map((note) => {
          const isActive = note.id === currentId;
          // Display rules for the encrypted-title world:
          //   - Active note → use the in-memory plaintext title from the editor.
          //   - Legacy note (still has plaintext `title` field) → show it.
          //   - Otherwise → generic "Encrypted note" placeholder; the user
          //     identifies it by date until they unlock it.
          const displayTitle = isActive
            ? currentTitle || "Untitled note"
            : note.title || "Encrypted note";
          return (
            <button
              key={note.id}
              onClick={() => onSelectNote(note)}
              className={cn(
                "group flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-all",
                isActive
                  ? "border-primary/40 bg-primary/15 shadow-sm"
                  : "border-transparent bg-sidebar-item hover:border-sidebar-border hover:bg-sidebar-item-hover",
              )}
            >
              <div className="flex w-full items-center gap-1.5">
                <Lock
                  className={cn(
                    "h-3 w-3 shrink-0",
                    isActive ? "text-primary" : "text-sidebar-muted",
                  )}
                />
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    isActive
                      ? "text-sidebar-foreground"
                      : "text-sidebar-foreground/90",
                  )}
                >
                  {displayTitle}
                </span>
              </div>
              <span className="text-[10px] text-sidebar-muted">
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

      <div className="border-t border-sidebar-border pt-3 text-[10px] text-sidebar-muted">
        Locally encrypted · Offline-first
      </div>
    </aside>
  );
};

export default Sidebar;
