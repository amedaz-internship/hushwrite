import { api, isLoggedIn } from "./api";
import { getAllNotes, saveNote, deleteNote, VAULT_META_ID } from "./db";

const LAST_SYNCED_KEY = "hushwrite-last-synced";

function getLastSyncedAt() {
  return localStorage.getItem(LAST_SYNCED_KEY) || null;
}

function setLastSyncedAt(ts) {
  localStorage.setItem(LAST_SYNCED_KEY, ts);
}

// Convert a local IndexedDB note (camelCase) to the server format (snake_case).
function localToServer(note) {
  return {
    id: note.id,
    ciphertext: arrayToBase64(note.ciphertext),
    iv: arrayToBase64(note.iv),
    salt: arrayToBase64(note.salt),
    title_ciphertext: note.titleCiphertext
      ? arrayToBase64(note.titleCiphertext)
      : null,
    title_iv: note.titleIv ? arrayToBase64(note.titleIv) : null,
    vault: note.vault || false,
    image_ids: note.imageIds || [],
    created_at: note.createdAt || new Date().toISOString(),
    updated_at: note.updatedAt || new Date().toISOString(),
  };
}

// Convert a server note (snake_case) to local IndexedDB format (camelCase).
function serverToLocal(note) {
  return {
    id: note.id,
    ciphertext: base64ToArray(note.ciphertext),
    iv: base64ToArray(note.iv),
    salt: base64ToArray(note.salt),
    titleCiphertext: note.title_ciphertext
      ? base64ToArray(note.title_ciphertext)
      : null,
    titleIv: note.title_iv ? base64ToArray(note.title_iv) : null,
    vault: !!note.vault,
    imageIds: note.image_ids
      ? typeof note.image_ids === "string"
        ? JSON.parse(note.image_ids)
        : note.image_ids
      : [],
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  };
}

// Uint8Array / ArrayBuffer → base64 string
function arrayToBase64(arr) {
  if (!arr) return null;
  const bytes =
    arr instanceof Uint8Array ? arr : new Uint8Array(arr.buffer || arr);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// base64 string → Uint8Array
function base64ToArray(b64) {
  if (!b64) return null;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Perform a full sync with the server.
 * Returns { pulled, pushed } counts.
 */
export async function syncNotes() {
  if (!isLoggedIn()) {
    throw new Error("Not logged in");
  }

  const localNotes = await getAllNotes();
  const lastSyncedAt = getLastSyncedAt();

  // Convert local notes to server format
  const payload = localNotes
    .filter((n) => n.id !== VAULT_META_ID)
    .map(localToServer);

  const { pull, pushed } = await api.sync(payload, lastSyncedAt);

  // Write pulled notes (server-newer) into IndexedDB
  for (const serverNote of pull) {
    const local = serverToLocal(serverNote);
    await saveNote(local);
  }

  // Update last synced timestamp
  setLastSyncedAt(new Date().toISOString());

  return {
    pulled: pull.length,
    pushed: pushed.length,
  };
}
