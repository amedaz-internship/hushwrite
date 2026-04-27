-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);

-- Tracks deleted notes so sync can propagate deletions across devices
CREATE TABLE IF NOT EXISTS deleted_notes (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deleted_notes_user_id ON deleted_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_deleted_notes_deleted_at ON deleted_notes(deleted_at);
