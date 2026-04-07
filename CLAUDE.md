# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hushwrite is a client-only, offline-first encrypted notes PWA. All notes and images live in the browser's IndexedDB; note content is encrypted with AES-GCM using a key derived from a user-supplied passphrase. There is no backend.

Note: this directory sits inside the larger `tbites` monorepo, but hushwrite is an unrelated standalone app — ignore the parent `tbites/CLAUDE.md` (Medusa/Next.js storefront) when working here.

## Commands

```bash
npm run dev       # Vite dev server (PWA enabled in dev via VitePWA devOptions)
npm run build     # Production build to dist/
npm run preview   # Preview built app
npm run lint      # ESLint (flat config in eslint.config.js)
```

There is no test suite.

## Architecture

### Stack
- **React 19** + **Vite 8**, JSX (no TypeScript; `jsconfig.json` provides the `@/*` → `src/*` alias also defined in [vite.config.js](vite.config.js))
- **Tailwind CSS 3** + **shadcn/ui** style primitives in [src/components/ui/](src/components/ui/) (Radix-based: dialog, alert-dialog, button, input)
- **CKEditor 5** (`@ckeditor/ckeditor5-build-classic`) is the rich-text editor
- **idb** wraps IndexedDB; **vite-plugin-pwa** registers a service worker (autoUpdate, 5 MB Workbox cache cap)
- **html2pdf.js** + **turndown** + **dompurify** drive note export/sanitization
- **react-hot-toast** for notifications

### Data layer — [src/js/db.js](src/js/db.js)
Single IndexedDB database `hushwrite-db` (version 2) with two object stores, both keyed by `id`:
- `notes` — encrypted note records
- `images` — image blobs referenced from notes (stored separately so editor HTML can hold lightweight references and large binaries don't bloat note records)

All persistence flows through the small helper functions in this file (`saveNote`, `getAllNotes`, `deleteNote`, `saveImage`, `getImage`, `deleteImage`). When changing the schema, bump `DB_VERSION` and extend the `upgrade` callback.

### Crypto layer — [src/js/crypto.js](src/js/crypto.js)
Uses the WebCrypto SubtleCrypto API end-to-end:
- `deriveKey(passphrase, salt)` — PBKDF2-SHA256, 100k iterations → AES-GCM 256-bit key
- `encryptContent` — random 12-byte IV per encryption; also stores a SHA-256 hash of the plaintext alongside the ciphertext
- `decryptContent` — re-hashes the decrypted plaintext and compares against the stored hash; mismatch (or any decrypt error) is surfaced as a generic "Note corrupted, tampered, or wrong password" error so wrong-passphrase and tamper cases are indistinguishable

A note record therefore needs to persist `{ ciphertext, iv, salt, hash }` together; preserve all four when modifying note save/load paths.

### Component layout — [src/](src/)
- [App.jsx](src/App.jsx) is the single top-level component. It owns the canonical state (`notes`, `currentId`, `selectedNote`, `markdown`, `title`) and passes it down — there is no router and no global state library.
- [components/Sidebar.jsx](src/components/Sidebar.jsx) — note list / selection / new-note
- [components/Markdown.jsx](src/components/Markdown.jsx) — CKEditor host; orchestrates encrypt/decrypt, image insertion (saved to `images` store and rendered back via `renderImages`), and uses promise-returning modals (`PassPhraseModal`, `DeleteModal`) to gate save/delete on passphrase entry / confirmation
- [components/Preview.jsx](src/components/Preview.jsx) — read-only rendered view
- [components/ExportNotes.jsx](src/components/ExportNotes.jsx) — PDF/markdown export pipeline (html2pdf + turndown + dompurify)
- [lib/theme.jsx](src/lib/theme.jsx) — theme provider; [lib/utils.js](src/lib/utils.js) — `cn()` class merge helper for shadcn components

### PWA — [vite.config.js](vite.config.js)
`VitePWA` is configured with `registerType: "autoUpdate"` and `devOptions.enabled: true` (so the SW is active in dev too). Manifest name is "Secure Notes". When changing icons/manifest, edit this file rather than adding a separate `manifest.json`.

## Conventions

- Use the `@/` import alias for anything under `src/` (e.g. `import { Button } from "@/components/ui/button"`).
- New UI primitives should follow the shadcn pattern already in [src/components/ui/](src/components/ui/) (Radix slot + `class-variance-authority` + `cn()`).
- Modal interactions in `Markdown.jsx` use a `setModal({ type, resolve, reject })` pattern that turns dialogs into awaitable promises — preserve this shape when adding new gated actions.
- Plaintext should never be persisted: anything written to the `notes` store must go through `encryptContent` first.
