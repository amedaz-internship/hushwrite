import { cn } from "@/lib/utils";

const Icon = ({ name, className }) => (
  <span className={cn("material-symbols-outlined", className)}>{name}</span>
);

// Icon-rail navigation (column 1 of the three-column vault layout).
// Section switching is decorative for now — the app's only mode is "Notes".
const Sidebar = ({
  onNewNote,
  onFocusSearch,
  activeSection = "notes",
  onSectionChange,
}) => {
  const sections = [
    { id: "notes", label: "Notes", icon: "description" },
    { id: "search", label: "Search", icon: "search", action: onFocusSearch },
  ];

  return (
    <aside className="sticky left-0 flex h-full w-64 flex-col gap-2 border-r border-outline-variant/10 bg-surface-container-lowest p-4">
      <div className="mb-6 px-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-vault-primary/20 bg-primary-container/20">
            <Icon name="enhanced_encryption" className="text-vault-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold leading-none text-vault-primary">
              Hushwrite
            </h2>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-vault-primary/60">
              Secure Session Active
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onNewNote}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-surface-container-high px-4 py-3 text-sm font-medium text-vault-primary transition-all hover:bg-surface-container-highest"
      >
        <Icon name="add" />
        New Note
      </button>

      <nav className="space-y-1">
        {sections.map((s) => {
          const isActive = s.id === activeSection;
          return (
            <button
              key={s.id}
              onClick={() => {
                onSectionChange?.(s.id);
                s.action?.();
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all",
                isActive
                  ? "bg-surface-container-high text-vault-primary"
                  : "text-outline hover:bg-surface-container-low hover:text-on-surface",
              )}
            >
              <Icon name={s.icon} />
              {s.label}
            </button>
          );
        })}
      </nav>

    </aside>
  );
};

export default Sidebar;
