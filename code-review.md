# Code Review: `elissa-app` Branch

## Requirements Checklist (Phase 1)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | Markdown Editor | Done | CKEditor with rich text editing |
| 2 | Image Embedding | Done | Images embedded as base64 data URLs via file input |
| 3 | Export as `.md` | Done | Uses `turndown` to convert to Markdown |
| 4 | Export as `.pdf` | Done | Uses `html2pdf.js` |
| 5 | Local Encryption (AES-GCM) | Done | PBKDF2 key derivation + AES-GCM, salt and IV per note |
| 6 | Tamper Detection | Done | SHA-256 hash stored pre-encryption, verified on decrypt |
| 7 | Fully Offline (PWA) | Done | `vite-plugin-pwa` with service worker and manifest |

**Phase 2 (`.hwrite` format):** Not started.
**Phase 3 (Backend):** Not started.

---

## What's Good

- **Crypto implementation is solid** — Correct use of PBKDF2 with 100k iterations, AES-GCM, unique salt/IV per note, and SHA-256 tamper detection. This is well done.
- **IndexedDB usage** is clean and well-structured using the `idb` library.
- **Component separation** — Editor, sidebar, preview, and export are properly split into their own files.
- **PWA config** is set up correctly with auto-update and offline caching.
- **Good commit history** — Work was broken into logical, incremental commits.

---

## Issues to Address

### High Priority

1. **XSS via `dangerouslySetInnerHTML`** (`Preview.jsx:7`) — The preview renders raw HTML without sanitization. Use a sanitizer like `DOMPurify` before rendering.

2. **Custom event for note loading is fragile** (`App.jsx:28-31`, `Markdown.jsx:34-62`) — Using `window.dispatchEvent(new CustomEvent("loadNote"))` to communicate between components is an anti-pattern in React. Pass a callback prop or use context instead.

3. **No delete note functionality** — Users can create and save notes but cannot delete them.

4. **`SavedNote.jsx` is unused** — The component exists but is never imported anywhere. `Sidebar.jsx` duplicates its functionality inline. Remove the dead code.

### Medium Priority

5. **`dev-dist/` committed to git** — `dev-dist/sw.js` and `dev-dist/workbox-*.js` are build artifacts and should be added to `.gitignore`, not tracked in the repo.

6. **README replaced with Vite boilerplate** — The original project README was overwritten with the default Vite template text. Replace with project-specific documentation.

7. **No `updatedAt` field on notes** — Notes store `createdAt` but never update the timestamp on re-save, so the date shown in the sidebar becomes stale.

8. **Images stored as base64 inside note content** — Large images will bloat IndexedDB. The `IMAGES_STORE` in `db.js` is created but never used — was this intended for separate image storage?

9. **Password prompted via `window.prompt()`** — Not great UX and may be blocked by some browsers. Consider a modal or inline input.

### Low Priority

10. **Hash comparison via `JSON.stringify`** (`crypto.js:64`) — Comparing arrays by stringifying works but is fragile. Consider using `every()` or a dedicated comparison.

11. **No confirmation before overwriting a note** — Re-saving with a different passphrase silently overwrites without warning.

12. **Unused dependencies** — `react-markdown` and `rehype-raw` are in `package.json` but never imported anywhere. Clean these up.

13. **`@types/react` in devDependencies** — Project doesn't use TypeScript, so these type packages are unnecessary.
