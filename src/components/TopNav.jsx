import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme.jsx";

const Icon = ({ name, className }) => (
  <span className={cn("material-symbols-outlined", className)}>{name}</span>
);

const TopNav = ({ isUnlocked, onLock, notesCount = 0 }) => {
  const { theme, toggleTheme } = useTheme();
  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between bg-surface px-6">
      <div className="flex items-center gap-8">
        <span className="text-xl font-semibold tracking-tighter text-on-surface">
          Hushwrite
        </span>
        <nav className="hidden items-center gap-6 font-semibold tracking-tight md:flex">
          <a
            className="flex items-center gap-2 border-b-2 border-vault-primary pb-1 font-medium text-vault-primary transition-colors duration-200 hover:text-on-surface"
            href="#"
          >
            All Notes
            <span className="rounded-full bg-primary-container/20 px-2 py-0.5 text-[10px] font-semibold text-vault-primary">
              {notesCount}
            </span>
          </a>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onLock}
          disabled={!isUnlocked}
          className={cn(
            "flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-1.5 text-sm font-medium text-vault-primary transition-all hover:bg-surface-container-highest active:scale-95",
            !isUnlocked && "cursor-not-allowed opacity-50",
          )}
        >
          <Icon name={isUnlocked ? "lock_open" : "lock"} className="text-sm" />
          <span>{isUnlocked ? "Lock Session" : "Locked"}</span>
        </button>
        <div className="flex gap-2">
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="p-2 text-outline transition-colors hover:text-on-surface active:scale-95"
          >
            <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default TopNav;
