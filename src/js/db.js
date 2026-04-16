import { openDB } from "idb";

const DB_NAME = "hushwrite-db";
const DB_VERSION = 2;
const NOTES_STORE = "notes";
const IMAGES_STORE = "images";

// Reserved note id used to persist vault metadata (salt + passphrase
// verifier). Stored in the notes store so no schema migration is needed;
// filtered out everywhere user-facing notes are listed.
export const VAULT_META_ID = "__vault_meta__";

export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        db.createObjectStore(IMAGES_STORE, { keyPath: "id" });
      }
    },
  });
};


export const saveNote = async (note) => {
  const db = await initDB();
  await db.put(NOTES_STORE, note);
};

export const getAllNotes = async () => {
  const db = await initDB();
  const all = await db.getAll(NOTES_STORE);
  return all.filter((n) => n.id !== VAULT_META_ID);
};

export const getNote = async (id) => {
  const db = await initDB();
  return db.get(NOTES_STORE, id);
};

export const getVaultMeta = async () => {
  const db = await initDB();
  return db.get(NOTES_STORE, VAULT_META_ID);
};

export const saveVaultMeta = async (meta) => {
  const db = await initDB();
  await db.put(NOTES_STORE, { ...meta, id: VAULT_META_ID });
};

export const deleteNote = async (id) => {
  const db = await initDB();
  await db.delete(NOTES_STORE, id);
};

export const saveImage = async (image) => {
  const db = await initDB();
  await db.put(IMAGES_STORE, image); 
};

export const getImage = async (id) => {
  const db = await initDB();
  return db.get(IMAGES_STORE, id);
};

export const deleteImage = async (id) => {
  const db = await initDB();
  await db.delete(IMAGES_STORE, id);
};