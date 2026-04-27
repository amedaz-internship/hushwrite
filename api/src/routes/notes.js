import { Hono } from "hono";
import { authGuard } from "../middleware/auth.js";

const notes = new Hono();

// All note routes require authentication
notes.use("/*", authGuard());

// GET /notes — get all notes for the authenticated user
notes.get("/", async (c) => {
  const userId = c.get("userId");

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC"
  )
    .bind(userId)
    .all();

  return c.json({ notes: results });
});

// GET /notes/:id — get a single note
notes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const noteId = c.req.param("id");

  const note = await c.env.DB.prepare(
    "SELECT * FROM notes WHERE id = ? AND user_id = ?"
  )
    .bind(noteId, userId)
    .first();

  if (!note) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json({ note });
});

// POST /notes — create or update a note (upsert)
notes.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const { id, ciphertext, iv, salt, title_ciphertext, title_iv, vault, image_ids, created_at, updated_at } = body;

  if (!id || !ciphertext || !iv || !salt) {
    return c.json({ error: "Missing required fields: id, ciphertext, iv, salt" }, 400);
  }

  // Upsert — insert or replace
  await c.env.DB.prepare(`
    INSERT INTO notes (id, user_id, ciphertext, iv, salt, title_ciphertext, title_iv, vault, image_ids, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ciphertext = excluded.ciphertext,
      iv = excluded.iv,
      salt = excluded.salt,
      title_ciphertext = excluded.title_ciphertext,
      title_iv = excluded.title_iv,
      vault = excluded.vault,
      image_ids = excluded.image_ids,
      updated_at = excluded.updated_at
  `)
    .bind(
      id,
      userId,
      ciphertext,
      iv,
      salt,
      title_ciphertext || null,
      title_iv || null,
      vault ? 1 : 0,
      image_ids ? JSON.stringify(image_ids) : null,
      created_at || new Date().toISOString(),
      updated_at || new Date().toISOString()
    )
    .run();

  return c.json({ success: true, id }, 201);
});

// DELETE /notes/:id — delete a note
notes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const noteId = c.req.param("id");

  const result = await c.env.DB.prepare(
    "DELETE FROM notes WHERE id = ? AND user_id = ?"
  )
    .bind(noteId, userId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json({ success: true });
});

export default notes;
