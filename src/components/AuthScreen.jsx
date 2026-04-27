import { useState } from "react";
import { cn } from "@/lib/utils";
import { api, setAuth } from "@/js/api";

const Icon = ({ name, className }) => (
  <span className={cn("material-symbols-outlined", className)}>{name}</span>
);

const AuthScreen = ({ onAuth }) => {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
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

      setAuth(data.token, data.userId);
      onAuth();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-vault-primary/20 bg-primary-container/20">
            <Icon
              name="enhanced_encryption"
              className="text-2xl text-vault-primary"
            />
          </div>
          <h1 className="text-2xl font-bold text-on-surface">Hushwrite</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {mode === "login"
              ? "Sign in to sync your notes"
              : "Create an account to sync across devices"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2.5 text-sm text-on-surface placeholder-outline focus:border-vault-primary/60 focus:outline-none"
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
              className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2.5 text-sm text-on-surface placeholder-outline focus:border-vault-primary/60 focus:outline-none"
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
                className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2.5 text-sm text-on-surface placeholder-outline focus:border-vault-primary/60 focus:outline-none"
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
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="text-xs text-vault-primary hover:underline"
          >
            {mode === "login"
              ? "Don't have an account? Register"
              : "Already have an account? Sign in"}
          </button>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={onAuth}
            className="text-xs text-outline hover:text-on-surface-variant"
          >
            Skip — use offline only
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
