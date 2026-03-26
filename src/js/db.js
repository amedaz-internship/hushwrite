import { openDB } from "idb";

const DB_NAME = "hushwrite-db";
const DB_VERSION = 2;
const NOTES_STORE = "notes";
const IMAGES_STORE = "images";

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
  return db.getAll(NOTES_STORE);
};


export const saveImage = async (image) => {
  const db = await initDB();
  await db.put(IMAGES_STORE, image);
};

export const getImage = async (id) => {
  const db = await initDB();
  return db.get(IMAGES_STORE, id);
};