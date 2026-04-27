import { Hono } from "hono";
import { authGuard } from "../middleware/auth.js";

const sync = new Hono();

sync.use("/*", authGuard());

/**
 * POST /sync
 *
 * Client sends its local notes with timestamps.
 * Server responds with what the client needs to update and accepts what's newer.
 *
 * Strategy: last-write-wins based on updated_at.
 *
 * Request body:
 * {
 *   notes: [{ id, ciphertext, iv, salt, title_ciphertext, title_iv, vault, image_ids, created_at, updated_at }],
 *   last_synced_at: "ISO string" | null  (when the client last synced)
 * }
 *
 * Response:
 * {
 *   pull: [notes newer on server],
 *   pushed: [ids accepted from client],
 *   deleted: [ids deleted on server since last sync]
 * }
 */
sync.post("/", async (c) => {
  const userId = c.get("userId");
  const { notes: clientNotes = [], last_synced_at } = await c.req.json();

  // Get all server notes for this user
  const { results: serverNotes } = await c.env.DB.prepare(
    "SELECT * FROM notes WHERE user_id = ?"
  )
    .bind(userId)
    .all();

  const serverMap = new Map(serverNotes.map((n) => [n.id, n]));

  const pull = [];    // notes to send to client (server is newer)
  const pushed = [];  // note ids accepted from client

  for (const clientNote of clientNotes) {
    const serverNote = serverMap.get(clientNote.id);

    if (!serverNote) {
      // New note from client — accept it
      await upsertNote(c.env.DB, userId, clientNote);
      pushed.push(clientNote.id);
    } else {
      const clientTime = new Date(clientNote.updated_at).getTime();
      const serverTime = new Date(serverNote.updated_at).getTime();

      if (clientTime > serverTime) {
        // Client is newer — accept it
        await upsertNote(c.env.DB, userId, clientNote);
        pushed.push(clientNote.id);
      }
      // If server is newer, it will be included in pull below
    }

    // Remove from map so we know what's left (server-only notes)
    serverMap.delete(clientNote.id);
  }

  // Remaining server notes that client doesn't have — send to client
  for (const serverNote of serverMap.values()) {
    pull.push(serverNote);
  }

  // Also include server notes that are newer than client versions
  for (const serverNote of serverNotes) {
    const clientNote = clientNotes.find((n) => n.id === serverNote.id);
    if (clientNote) {
      const clientTime = new Date(clientNote.updated_at).getTime();
      const serverTime = new Date(serverNote.updated_at).getTime();
      if (serverTime > clientTime) {
        pull.push(serverNote);
      }
    }
  }

  return c.json({ pull, pushed, deleted: [] });
});

async function upsertNote(db, userId, note) {
  await db
    .prepare(
      `INSERT INTO notes (id, user_id, ciphertext, iv, salt, title_ciphertext, title_iv, vault, image_ids, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         ciphertext = excluded.ciphertext,
         iv = excluded.iv,
         salt = excluded.salt,
         title_ciphertext = excluded.title_ciphertext,
         title_iv = excluded.title_iv,
         vault = excluded.vault,
         image_ids = excluded.image_ids,
         updated_at = excluded.updated_at`
    )
    .bind(
      note.id,
      userId,
      note.ciphertext,
      note.iv,
      note.salt,
      note.title_ciphertext || null,
      note.title_iv || null,
      note.vault ? 1 : 0,
      note.image_ids ? JSON.stringify(note.image_ids) : null,
      note.created_at || new Date().toISOString(),
      note.updated_at || new Date().toISOString()
    )
    .run();
}

export default sync;
