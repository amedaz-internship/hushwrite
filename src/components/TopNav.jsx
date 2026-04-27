import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme.jsx";
import { getUserEmail, api } from "@/js/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const Icon = ({ name, className }) => (
  <span className={cn("material-symbols-outlined", className)}>{name}</span>
);

const ProfileDropdown = ({ onLogout, onChangePassword, onAbout }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const email = getUserEmail();

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Account"
        className="flex items-center gap-1.5 rounded-lg p-2 text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface active:scale-95"
      >
        <Icon name="account_circle" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container shadow-xl">
          {email && (
            <div className="border-b border-outline-variant/20 px-4 py-3">
              <p className="text-xs font-medium text-on-surface-variant">Signed in as</p>
              <p className="truncate text-sm font-semibold text-on-surface">{email}</p>
            </div>
          )}
          <div className="py-1">
            <button
              onClick={() => { setOpen(false); onChangePassword(); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-on-surface transition-colors hover:bg-surface-container-high"
            >
              <Icon name="lock_reset" className="text-[20px] text-outline" />
              Change Password
            </button>
            <button
              onClick={() => { setOpen(false); onAbout(); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-on-surface transition-colors hover:bg-surface-container-high"
            >
              <Icon name="info" className="text-[20px] text-outline" />
              About
            </button>
            <div className="my-1 border-t border-outline-variant/20" />
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-error transition-colors hover:bg-error/10"
            >
              <Icon name="logout" className="text-[20px]" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ChangePasswordDialog = ({ open, onOpenChange }) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword) {
      setError("All fields are required.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const data = await api.changePassword(currentPassword, newPassword);
      setSuccess(data.message);
      setTimeout(() => {
        reset();
        onOpenChange(false);
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-on-surface-variant">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2.5 text-sm text-on-surface placeholder-outline focus:border-vault-primary/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-on-surface-variant">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2.5 text-sm text-on-surface placeholder-outline focus:border-vault-primary/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-on-surface-variant">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2.5 text-sm text-on-surface placeholder-outline focus:border-vault-primary/60 focus:outline-none"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">{error}</p>
          )}
          {success && (
            <p className="rounded-lg bg-vault-primary/10 px-3 py-2 text-xs text-vault-primary">{success}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-vault-primary px-4 py-2.5 text-sm font-medium text-on-primary-fixed transition-all hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Icon name="progress_activity" className="animate-spin text-sm" />
            ) : (
              <Icon name="lock_reset" className="text-sm" />
            )}
            Change Password
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const AboutDialog = ({ open, onOpenChange }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>About Hushwrite</DialogTitle>
        <DialogDescription>Privacy-first encrypted notes</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 text-sm text-on-surface-variant">
        <p>
          Hushwrite is an offline-first, encrypted notes app that keeps your thoughts private.
          All notes are encrypted with AES-GCM using a key derived from your passphrase — your
          data never leaves your device in plaintext.
        </p>
        <p>
          With optional cloud sync, you can access your encrypted notes across devices while
          maintaining full end-to-end encryption. The server never sees your content.
        </p>
        <div className="border-t border-outline-variant/20 pt-4">
          <p className="text-xs text-outline">
            Made by <span className="font-semibold text-on-surface-variant">Elissa Tenn</span>, intern at{" "}
            <span className="font-semibold text-on-surface-variant">Amedaz</span> in Zahle, Lebanon.
          </p>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);

const TopNav = ({ isUnlocked, onLock, notesCount = 0, onSync, syncing = false, isOnline = false, onLogout }) => {
  const { theme, toggleTheme } = useTheme();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <>
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
          <div className="flex items-center gap-2">
            {isOnline && (
              <button
                onClick={onSync}
                disabled={syncing}
                title="Sync notes"
                className={cn(
                  "flex items-center gap-1.5 rounded-lg bg-surface-container-high px-3 py-1.5 text-sm font-medium text-vault-primary transition-all hover:bg-surface-container-highest active:scale-95",
                  syncing && "cursor-not-allowed opacity-50",
                )}
              >
                <Icon name="sync" className={cn("text-sm", syncing && "animate-spin")} />
                <span>{syncing ? "Syncing…" : "Sync"}</span>
              </button>
            )}
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="p-2 text-outline transition-colors hover:text-on-surface active:scale-95"
            >
              <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} />
            </button>
            {onLogout && (
              <ProfileDropdown
                onLogout={onLogout}
                onChangePassword={() => setChangePasswordOpen(true)}
                onAbout={() => setAboutOpen(true)}
              />
            )}
          </div>
        </div>
      </header>
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  );
};

export default TopNav;
