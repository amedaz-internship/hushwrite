import { Hono } from "hono";
import { authGuard } from "../middleware/auth.js";

const SNAPSHOT_LIMIT = 10;

const snapshots = new Hono();

snapshots.use("/*", authGuard());

/**
 * POST /api/v1/snapshots
 *
 * Create a new snapshot. The blob is an opaque encrypted JSON string the
 * server never decrypts. Manifest is `[{id, updated_at, vault}]` per note
 * so clients can preview restore diffs without downloading the blob.
 *
 * Body: { device_id, device_label, note_count, image_count, has_vault, manifest, blob }
 */
snapshots.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const {
    device_id,
    device_label,
    note_count = 0,
    image_count = 0,
    has_vault = false,
    manifest = [],
    blob,
  } = body || {};

  if (!device_id || !device_label || typeof blob !== "string") {
    return c.json({ error: "device_id, device_label, and blob are required" }, 400);
  }

  // Structural validation: if any manifest entry is marked vault: true,
  // the snapshot must include vault metadata in the blob (signalled by
  // has_vault). We don't crack the blob — just enforce the contract.
  const hasVaultNote = Array.isArray(manifest) && manifest.some((m) => m && m.vault);
  if (hasVaultNote && !has_vault) {
    return c.json(
      { error: "Snapshot contains vault notes but is missing vault metadata" },
      400,
    );
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const manifestText = JSON.stringify(manifest);

  await c.env.DB.prepare(
    `INSERT INTO snapshots (id, user_id, device_id, device_label, created_at, note_count, image_count, has_vault, pinned, manifest, blob)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  )
    .bind(
      id,
      userId,
      device_id,
      device_label,
      createdAt,
      note_count,
      image_count,
      has_vault ? 1 : 0,
      manifestText,
      blob,
    )
    .run();

  // Rotation: keep the SNAPSHOT_LIMIT newest unpinned snapshots; delete the rest.
  const { results: extras } = await c.env.DB.prepare(
    `SELECT id FROM snapshots
       WHERE user_id = ? AND pinned = 0
       ORDER BY created_at DESC
       LIMIT -1 OFFSET ?`,
  )
    .bind(userId, SNAPSHOT_LIMIT)
    .all();

  for (const row of extras || []) {
    await c.env.DB.prepare("DELETE FROM snapshots WHERE id = ? AND user_id = ?")
      .bind(row.id, userId)
      .run();
  }

  return c.json({
    id,
    device_id,
    device_label,
    created_at: createdAt,
    note_count,
    image_count,
    has_vault: !!has_vault,
    pinned: false,
  });
});

/**
 * GET /api/v1/snapshots
 *
 * List snapshots (no blob, includes manifest for diff previews).
 */
snapshots.get("/", async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB.prepare(
    `SELECT id, device_id, device_label, created_at, note_count, image_count, has_vault, pinned, manifest
       FROM snapshots
       WHERE user_id = ?
       ORDER BY created_at DESC`,
  )
    .bind(userId)
    .all();

  const snapshots = (results || []).map((r) => ({
    id: r.id,
    device_id: r.device_id,
    device_label: r.device_label,
    created_at: r.created_at,
    note_count: r.note_count,
    image_count: r.image_count,
    has_vault: !!r.has_vault,
    pinned: !!r.pinned,
    manifest: safeParse(r.manifest, []),
  }));

  return c.json({ snapshots, limit: SNAPSHOT_LIMIT });
});

/**
 * GET /api/v1/snapshots/:id
 *
 * Download a single snapshot including its blob.
 */
snapshots.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const row = await c.env.DB.prepare(
    `SELECT id, device_id, device_label, created_at, note_count, image_count, has_vault, pinned, manifest, blob
       FROM snapshots
       WHERE id = ? AND user_id = ?`,
  )
    .bind(id, userId)
    .first();

  if (!row) return c.json({ error: "Snapshot not found" }, 404);

  return c.json({
    id: row.id,
    device_id: row.device_id,
    device_label: row.device_label,
    created_at: row.created_at,
    note_count: row.note_count,
    image_count: row.image_count,
    has_vault: !!row.has_vault,
    pinned: !!row.pinned,
    manifest: safeParse(row.manifest, []),
    blob: row.blob,
  });
});

/**
 * PATCH /api/v1/snapshots/:id
 *
 * Update mutable fields on a snapshot (pin state, device label).
 */
snapshots.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json();

  const fields = [];
  const values = [];

  if (typeof body.pinned === "boolean") {
    fields.push("pinned = ?");
    values.push(body.pinned ? 1 : 0);
  }
  if (typeof body.device_label === "string" && body.device_label.trim()) {
    fields.push("device_label = ?");
    values.push(body.device_label.trim());
  }

  if (!fields.length) return c.json({ error: "No updatable fields" }, 400);

  values.push(id, userId);
  const result = await c.env.DB.prepare(
    `UPDATE snapshots SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
  )
    .bind(...values)
    .run();

  if (!result.meta?.changes) return c.json({ error: "Snapshot not found" }, 404);
  return c.json({ ok: true });
});

/**
 * DELETE /api/v1/snapshots/:id
 */
snapshots.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const result = await c.env.DB.prepare(
    "DELETE FROM snapshots WHERE id = ? AND user_id = ?",
  )
    .bind(id, userId)
    .run();

  if (!result.meta?.changes) return c.json({ error: "Snapshot not found" }, 404);
  return c.json({ ok: true });
});

function safeParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export default snapshots;
