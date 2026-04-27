import { Hono } from "hono";
import { authGuard } from "../middleware/auth.js";

const sync = new Hono();

sync.use("/*", authGuard());

/**
 * POST /sync
 *
 * Client sends its local notes with timestamps plus any local deletions.
 * Server responds with what the client needs to update and accepts what's newer.
 *
 * Strategy: last-write-wins based on updated_at.
 *
 * Request body:
 * {
 *   notes: [{ id, ciphertext, iv, salt, title_ciphertext, title_iv, vault, image_ids, created_at, updated_at }],
 *   deleted_ids: [note ids deleted locally since last sync],
 *   last_synced_at: "ISO string" | null
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
  const { notes: clientNotes = [], deleted_ids: clientDeletedIds = [], last_synced_at } = await c.req.json();

  // --- Handle client-side deletions ---
  for (const noteId of clientDeletedIds) {
    await c.env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?")
      .bind(noteId, userId)
      .run();
    // Record the deletion so other devices learn about it
    await c.env.DB.prepare(
      `INSERT INTO deleted_notes (id, note_id, user_id, deleted_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    )
      .bind(crypto.randomUUID(), noteId, userId, new Date().toISOString())
      .run();
  }

  // --- Get server-side deletions since last sync ---
  let serverDeletedIds = [];
  if (last_synced_at) {
    const { results } = await c.env.DB.prepare(
      "SELECT note_id FROM deleted_notes WHERE user_id = ? AND deleted_at > ?"
    )
      .bind(userId, last_synced_at)
      .all();
    serverDeletedIds = results.map((r) => r.note_id);
  } else {
    // First sync — send all deletions
    const { results } = await c.env.DB.prepare(
      "SELECT note_id FROM deleted_notes WHERE user_id = ?"
    )
      .bind(userId)
      .all();
    serverDeletedIds = results.map((r) => r.note_id);
  }

  // Build set of deleted note IDs to skip during merge
  const deletedSet = new Set([...clientDeletedIds, ...serverDeletedIds]);

  // --- Merge notes ---
  const { results: serverNotes } = await c.env.DB.prepare(
    "SELECT * FROM notes WHERE user_id = ?"
  )
    .bind(userId)
    .all();

  const serverMap = new Map(serverNotes.map((n) => [n.id, n]));

  const pull = [];
  const pushed = [];

  for (const clientNote of clientNotes) {
    // Skip notes that have been deleted
    if (deletedSet.has(clientNote.id)) continue;

    const serverNote = serverMap.get(clientNote.id);

    if (!serverNote) {
      await upsertNote(c.env.DB, userId, clientNote);
      pushed.push(clientNote.id);
    } else {
      const clientTime = new Date(clientNote.updated_at).getTime();
      const serverTime = new Date(serverNote.updated_at).getTime();

      if (clientTime > serverTime) {
        await upsertNote(c.env.DB, userId, clientNote);
        pushed.push(clientNote.id);
      }
    }

    serverMap.delete(clientNote.id);
  }

  // Remaining server notes the client doesn't have (excluding deleted)
  for (const serverNote of serverMap.values()) {
    if (!deletedSet.has(serverNote.id)) {
      pull.push(serverNote);
    }
  }

  // Server notes newer than client versions
  for (const serverNote of serverNotes) {
    if (deletedSet.has(serverNote.id)) continue;
    const clientNote = clientNotes.find((n) => n.id === serverNote.id);
    if (clientNote) {
      const clientTime = new Date(clientNote.updated_at).getTime();
      const serverTime = new Date(serverNote.updated_at).getTime();
      if (serverTime > clientTime) {
        pull.push(serverNote);
      }
    }
  }

  return c.json({ pull, pushed, deleted: serverDeletedIds });
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
