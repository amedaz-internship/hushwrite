const API = import.meta.env.VITE_API_URL || "http://localhost:8787";

const TOKEN_KEY = "hushwrite-token";
const USER_KEY = "hushwrite-user";
const EMAIL_KEY = "hushwrite-email";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuth(token, userId, email) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, userId);
  if (email) localStorage.setItem(EMAIL_KEY, email);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EMAIL_KEY);
}

export function getUserEmail() {
  return localStorage.getItem(EMAIL_KEY);
}

export function getUserId() {
  return localStorage.getItem(USER_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
      clearAuth();
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

export const api = {
  register: (email, password) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email, password) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  sync: (notes, lastSyncedAt, deletedIds = []) =>
    request("/api/v1/sync", {
      method: "POST",
      body: JSON.stringify({ notes, last_synced_at: lastSyncedAt, deleted_ids: deletedIds }),
    }),

  forgotPassword: (email) =>
    request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token, newPassword) =>
    request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    }),

  changePassword: (currentPassword, newPassword) =>
    request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
};
