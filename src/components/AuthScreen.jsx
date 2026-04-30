import { useState } from "react";
import { cn } from "@/lib/utils";
import { api, setAuth } from "@/js/api";

const Icon = ({ name, className }) => (
  <span className={cn("material-symbols-outlined", className)}>{name}</span>
);

const inputClass =
  "w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2.5 text-sm text-on-surface placeholder-outline focus:border-vault-primary/60 focus:outline-none";

const AuthScreen = ({ onAuth }) => {
  // "login" | "register" | "forgot" | "reset"
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setSuccess(null);
  };

  const handleLoginRegister = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (mode === "register" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const data =
        mode === "login"
          ? await api.login(email, password)
          : await api.register(email, password);
      setAuth(data.token, data.userId, email);
      onAuth();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email) {
      setError("Enter your email address.");
      return;
    }

    setLoading(true);
    try {
      const data = await api.forgotPassword(email);
      setSuccess(data.message);
      // In dev mode the API returns the token directly
      if (data.reset_token) {
        setResetToken(data.reset_token);
        switchMode("reset");
        setSuccess("Reset token auto-filled (dev mode). Enter your new password.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!resetToken) {
      setError("Reset token is required.");
      return;
    }
    if (!newPassword) {
      setError("New password is required.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const data = await api.resetPassword(resetToken, newPassword);
      setSuccess(data.message);
      // Return to login after a short delay
      setTimeout(() => {
        switchMode("login");
        setPassword("");
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const subtitle = {
    login: "Sign in to sync your notes",
    register: "Create an account to sync across devices",
    forgot: "Enter your email to receive a reset link",
    reset: "Choose a new password",
  }[mode];

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src="/panda-192.png" alt="Hushwrite" className="mx-auto mb-4 h-14 w-14 rounded-full object-cover" />
          <h1 className="text-2xl font-bold text-on-surface">Hushwrite</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>
        </div>

        {/* ---- Login / Register ---- */}
        {(mode === "login" || mode === "register") && (
          <form onSubmit={handleLoginRegister} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                />
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-vault-primary px-4 py-2.5 text-sm font-medium text-on-primary-fixed transition-all hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Icon name="progress_activity" className="animate-spin text-sm" />
              ) : (
                <Icon name={mode === "login" ? "login" : "person_add"} className="text-sm" />
              )}
              {mode === "login" ? "Sign in" : "Create account"}
            </button>

            {mode === "login" && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-xs text-outline hover:text-on-surface-variant"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </form>
        )}

        {/* ---- Forgot Password ---- */}
        {mode === "forgot" && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                className={inputClass}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
                {error}
              </p>
            )}
            {success && (
              <p className="rounded-lg bg-vault-primary/10 px-3 py-2 text-xs text-vault-primary">
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-vault-primary px-4 py-2.5 text-sm font-medium text-on-primary-fixed transition-all hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Icon name="progress_activity" className="animate-spin text-sm" />
              ) : (
                <Icon name="mail" className="text-sm" />
              )}
              Send reset link
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => switchMode("reset")}
                className="text-xs text-outline hover:text-on-surface-variant"
              >
                Already have a reset token?
              </button>
            </div>
          </form>
        )}

        {/* ---- Reset Password ---- */}
        {mode === "reset" && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                Reset token
              </label>
              <input
                type="text"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder="Paste your reset token"
                autoFocus
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
                {error}
              </p>
            )}
            {success && (
              <p className="rounded-lg bg-vault-primary/10 px-3 py-2 text-xs text-vault-primary">
                {success}
              </p>
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
              Reset password
            </button>
          </form>
        )}

        {/* ---- Mode switchers ---- */}
        {(mode === "login" || mode === "register") && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => switchMode(mode === "login" ? "register" : "login")}
              className="text-xs text-vault-primary hover:underline"
            >
              {mode === "login"
                ? "Don't have an account? Register"
                : "Already have an account? Sign in"}
            </button>
          </div>
        )}

        {(mode === "forgot" || mode === "reset") && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="text-xs text-vault-primary hover:underline"
            >
              Back to sign in
            </button>
          </div>
        )}

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-outline-variant/30" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-surface px-3 text-[10px] font-semibold uppercase tracking-widest text-outline">
              Or
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onAuth}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-vault-primary/40 bg-surface-container px-4 py-2.5 text-sm font-semibold text-vault-primary transition-all hover:bg-surface-container-high active:scale-95"
        >
          <Icon name="cloud_off" className="text-base" />
          Continue locally
        </button>
        <p className="text-center text-[11px] text-outline">
          Notes stay encrypted on this device. No account, no sync.
        </p>
      </div>
    </div>
  );
};

export default AuthScreen;
