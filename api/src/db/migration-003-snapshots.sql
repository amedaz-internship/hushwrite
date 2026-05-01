-- Snapshots: versioned, encrypted, atomic backups of a device's full state.
-- The blob is opaque to the server; manifest holds {id, updated_at, vault}
-- per-note so the client can compute a diff without downloading the blob.
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  note_count INTEGER NOT NULL DEFAULT 0,
  image_count INTEGER NOT NULL DEFAULT 0,
  has_vault INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  manifest TEXT NOT NULL,
  blob TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snapshots_user_created
  ON snapshots(user_id, created_at DESC);
