import { openDB } from 'idb';

const DB_NAME = 'hushwrite-db';
const DB_VERSION = 1;
const STORE_NAME = 'notes';

export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
};

export const saveNote = async (note) => {
  const db = await initDB();
  await db.put(STORE_NAME, note);
};

export const getAllNotes = async () => {
  const db = await initDB();
  return db.getAll(STORE_NAME);
};