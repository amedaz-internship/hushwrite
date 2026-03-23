# Internship Objectives & Progress

## Skills Acquired

- **React** — Component architecture, hooks, and lifecycle management
- **State Management** — Application-level state handling patterns
- **LocalStorage & LocalStorage API** — Persistent key-value storage in the browser
- **IndexedDB** — Client-side structured data storage for larger datasets
- **Camera API** — Accessing device camera from the browser
- **File System Access API (Chrome)** — Reading and writing files directly from the browser

---

## Internship Project — Offline Markdown Note-Taking App

### Overview

Build a fully offline-capable note-taking application using React. The app is centered around a Markdown editor and includes local encryption, media embedding, and multiple export formats.

### Technical Constraints

- **Framework:** React (no TypeScript — JSDoc type annotations are accepted)
- **Connectivity:** The app must work completely offline with no server dependency (Phase 1 & 2)

---

## Phase 1 — Core App

> Priority: **Required**

1. **Markdown Editor** — Notes are authored and rendered as Markdown
2. **Image Embedding** — Users can insert images directly into note content
3. **Export Options** — Each note can be exported as `.md` or `.pdf`
4. **Local Encryption (AES-GCM)**
   - Notes are encrypted entirely in the browser
   - Encryption key is derived from a user-provided passphrase
   - Each note stores its own unique nonce/IV
5. **Tamper Detection** — The app can detect whether an encrypted note has been modified or corrupted
6. **Fully Offline** — App works with zero network connectivity (Service Worker / PWA)

---

## Phase 2 — Custom `.hwrite` File Format

> Priority: **Stretch Goal**

Introduce a custom `.hwrite` file format for importing and exporting notes. The format is JSON-based and supports both encrypted and plaintext notes.

### `.hwrite` Spec (v1.0)

```json
{
  "hwrite": "1.0",
  "encrypted": true | false,
  "nonce": "base64 (present only if encrypted)",
  "salt": "base64 (present only if encrypted)",
  "content": "base64-encrypted blob OR raw markdown string",
  "checksum": "SHA-256 hash for tamper detection",
  "created": "ISO 8601 timestamp",
  "modified": "ISO 8601 timestamp",
  "title": "Note Title"
}
```

### Requirements

1. **Export as `.hwrite`** — User can save any note as a `.hwrite` file (encrypted or plain)
2. **Import `.hwrite`** — User can open a `.hwrite` file; if encrypted, prompt for passphrase
3. **Validation on Import** — Verify the checksum and reject tampered files with a clear error
4. **Version Field** — The `hwrite` version key ensures forward-compatibility as the format evolves

---

## Phase 3 — Backend Server for Note Backup

> Priority: **Stretch Goal**

Add an optional backend server that allows users to back up and sync their notes remotely while preserving the offline-first architecture.

### Requirements

1. **Offline-First Stays** — The app must remain fully functional without the server; the backend is purely additive
2. **End-to-End Encryption** — Notes are encrypted client-side before upload; the server never sees plaintext
3. **Backup & Restore** — Users can push notes to the server and pull them onto a new device/browser
4. **Conflict Handling** — Basic strategy for when a local note and a remote note diverge (e.g. last-write-wins or prompt user)
5. **Authentication** — Simple auth flow (email/password or token-based) to tie backups to a user account
6. **Tech Stack** — Open (Node/Express, Go, Python, etc.) — intern's choice with justification
