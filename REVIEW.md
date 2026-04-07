# HushWrite — Code Review

**Reviewer:** Senior Engineer
**Author:** Intern
**Scope:** Phase 1 (core encrypted note app)
**Verdict:** Solid first project. Phase 1 objectives are functionally met — AES-GCM encryption with PBKDF2, IndexedDB persistence, image embedding, MD/PDF export, and a working PWA shell. The areas that need work are mostly **security correctness around the crypto layer** and a handful of **React data-flow mistakes** that will bite later. Nothing catastrophic, but the security-sensitive issues should be fixed before this is shown as portfolio work.

Below, items are ordered by severity. Each item has a **Why it matters** and a **Suggested fix** so you can act on them directly.

---

## Critical

### C1. `decryptContent` swallows real errors and reports the wrong cause
[src/js/crypto.js:78-80](src/js/crypto.js#L78-L80)

```js
} catch (err) {
  throw new Error("⚠️ Note corrupted, tampered, or wrong password.");
}
```

The catch block discards `err` entirely and throws a generic message. That's fine for the user-facing toast, but it also catches **bugs** — TypeErrors, missing IV bytes, programming mistakes — and disguises them as "wrong password". You will spend hours debugging a real bug because everything looks like a bad passphrase.

**Fix:** Log the original error to the console (or rethrow with `cause`), and only translate to the user-friendly message at the UI layer.

```js
} catch (err) {
  console.error("[decrypt] failed:", err);
  throw new Error("Note corrupted, tampered, or wrong password.");
}
```

---

### C2. The "tamper detection" hash is redundant and slightly misleading
[src/js/crypto.js:35-47, 66-75](src/js/crypto.js#L35-L75)

You hash the **plaintext** with SHA-256, store the hash alongside the ciphertext, and re-check it after decryption. There are two problems:

1. **AES-GCM is already authenticated.** The `GCM` in AES-GCM is Galois/Counter Mode — it produces an authentication tag that `crypto.subtle.decrypt` validates automatically. Any tampering of the ciphertext or IV causes `decrypt` to throw before you ever reach your hash check. The hash is doing nothing useful.
2. **Storing a hash of the plaintext leaks information.** It's a known-plaintext oracle: anyone with read access to the DB can confirm "is this note's content equal to X?" without the passphrase. For an app whose whole pitch is encryption, that's the wrong tradeoff.

**Fix:** Drop the plaintext hash entirely. Trust the GCM tag. If you want a checksum for the `.hwrite` file format (Phase 2 spec asks for SHA-256), hash the **ciphertext + IV + salt + metadata**, not the plaintext.

---

### C3. PBKDF2 iteration count is too low for 2026
[src/js/crypto.js:20](src/js/crypto.js#L20)

```js
iterations: 100000,
```

100k iterations was OWASP's recommendation around 2017. The current OWASP recommendation for PBKDF2-HMAC-SHA256 is **600,000+**. With cheap GPUs available to hobbyist attackers, 100k is brute-forceable for weak passphrases.

**Fix:** Bump to `600000`. It's a one-line change and the user experience cost is ~half a second on first decrypt. Even better, switch to Argon2id via `argon2-browser` if you want to learn a more modern KDF — but PBKDF2-600k is acceptable.

---

### C4. Passphrase is stringified into a Promise resolver but never cleared
[src/components/Markdown.jsx:46-52, 64-67](src/components/Markdown.jsx#L46-L67)

```js
const askPassphrase = useCallback(
  (mode) =>
    new Promise((resolve, reject) =>
      setModal({ type: "passphrase", mode, resolve, reject }),
    ),
  [],
);
```

The passphrase string sits in React state inside `modal.resolve`'s closure, then gets passed through `pw` and lives on the stack until garbage collection. JavaScript gives you no way to zero memory, but you can at least:

- Avoid keeping the passphrase in component state any longer than necessary (you already do this — good).
- Not pass the passphrase string around more than required.
- Consider deriving the key inside the modal component itself and only passing the `CryptoKey` object out, since `CryptoKey` is non-extractable (`extractable: false` — which you already do, good).

This is more "good hygiene" than a critical bug, but for a security-focused app it's worth thinking about.

---

## High

### H1. `onSave` no longer strips image data URLs before encrypting
[src/components/Markdown.jsx:138](src/components/Markdown.jsx#L138)

The earlier version of this file had a `stripImageSources()` helper that removed the inline `data:` URLs from `<img data-img-id="...">` tags before encryption, since the actual blob is already in the IndexedDB `images` store. The current `onSave` encrypts the full HTML including data URLs:

```js
const { ciphertext, iv, hash } = await encryptContent(markdown, key);
```

Result: every image is stored **twice** — once as a base64 string inside the encrypted note (3-4× the file size), and once as a Blob in the images store. A note with five photos can balloon from a few KB to several MB. Save-on-every-edit will eventually choke IndexedDB.

**Fix:** Reintroduce the strip step:

```js
const stripped = stripImageSources(markdown);
const { ciphertext, iv } = await encryptContent(stripped, key);
```

…and verify on load that `renderImages()` re-hydrates them from the `images` store. (It already does — that path works.)

---

### H2. Orphaned images are never cleaned up
[src/js/db.js:48-51](src/js/db.js#L48-L51), [src/components/Markdown.jsx:168-185](src/components/Markdown.jsx#L168-L185)

`deleteImage` exists but is never called. When a user deletes a note, its associated images stay in IndexedDB forever. Same when a user removes an image from a note in the editor — the blob lingers.

**Fix:** On note delete, walk the note's HTML, collect every `data-img-id`, and call `deleteImage` for each. For in-editor removal, listen to CKEditor's model change events for image removal (or accept the leak and add a "Compact storage" button that GCs unreferenced blobs in the images store).

---

### H3. `getAllNotes()` is called on every save just to find one note
[src/components/Markdown.jsx:140-143](src/components/Markdown.jsx#L140-L143)

```js
let existingNote;
if (currentId) {
  const allNotes = await getAllNotes();
  existingNote = allNotes.find((n) => n.id === currentId);
}
```

You're loading the entire notes table just to read one row's `createdAt`. As the notes count grows, save latency grows linearly.

**Fix:** Add `getNote(id)` to [src/js/db.js](src/js/db.js):

```js
export const getNote = (id) =>
  initDB().then((db) => db.get(NOTES_STORE, id));
```

…and use it. It's O(1) instead of O(n), and the call site reads better.

---

### H4. The decrypt `useEffect` is missing dependencies
[src/components/Markdown.jsx:99-122](src/components/Markdown.jsx#L99-L122)

```js
useEffect(() => {
  const loadSelectedNote = async () => { ... };
  loadSelectedNote();
}, [selectedNote]);
```

The effect uses `askPassphrase`, `setMarkdown`, `setCurrentId`, `setTitle` — none of which are in the dependency array. ESLint should be flagging this. It works today only because `askPassphrase` is wrapped in `useCallback([])` and the setters are stable, but the linter doesn't know that.

**Fix:** Either add the missing deps, or add a `// eslint-disable-next-line react-hooks/exhaustive-deps` with a comment explaining why. Don't leave it silently broken.

---

### H5. Race condition: passphrase modal Promise can leak if a second prompt is opened
[src/components/Markdown.jsx:46-78](src/components/Markdown.jsx#L46-L78)

If `askPassphrase` is called while a previous modal is still open (e.g. user clicks Save twice rapidly, or Save while a decrypt prompt is open), the new modal **overwrites** `modal` state. The previous Promise's `resolve`/`reject` is lost forever — it'll never settle, and the original `await askPassphrase(...)` hangs forever, leaking the closure (and the in-progress save).

**Fix:** Either reject the previous modal's Promise before opening a new one, or guard the call sites so a second prompt cannot be opened while one is already pending.

```js
const askPassphrase = useCallback((mode) => {
  return new Promise((resolve, reject) => {
    setModal((prev) => {
      prev?.reject?.(new Error("superseded"));
      return { type: "passphrase", mode, resolve, reject };
    });
  });
}, []);
```

---

## Medium

### M1. `App.jsx` is the wrong place to own editor state
[src/App.jsx:7-12](src/App.jsx#L7-L12)

`markdown`, `currentId`, `title`, and `selectedNote` all live at the App level even though only `<Markdown>` cares about them. The Sidebar only needs `currentId` and `notes`. The result is App threading 8+ props through to one component, and any keystroke in the editor re-renders App and the Sidebar.

**Fix:** Move `markdown`/`title`/`currentId` into `<Markdown>` itself. Lift only `notes` and `selectedNoteId` to App (or better: a tiny Zustand/Context store). The Sidebar can take `(notes, currentId, onSelect)` and the Markdown component owns its own draft.

---

### M2. Title is in two states at once
[src/App.jsx:10](src/App.jsx#L10), [src/components/Markdown.jsx:42-44](src/components/Markdown.jsx#L42-L44)

```js
useEffect(() => {
  if (!currentId) setTitle("");
}, [currentId, setTitle]);
```

This effect resets `title` to `""` whenever `currentId` becomes null. But the New Note button in [Sidebar.jsx](src/components/Sidebar.jsx) **also** clears state. Two sources of truth for "what's the current title" makes future bugs almost certain. Pick one.

---

### M3. CKEditor `removePlugins` doesn't actually remove the image plugin
[src/components/Markdown.jsx:255-265](src/components/Markdown.jsx#L255-L265)

The `removePlugins` array lists `"ImageUpload"`, `"ImageToolbar"`, etc. but the **classic build** has these compiled in and you cannot remove them at runtime — you'd see a warning in the console. The intended effect (preventing CKEditor from inserting its own image upload UI) is achieved more by accident than design. Either:

- Switch to a custom build that excludes the image plugins, or
- Accept the warning and move on (this is purely cosmetic if the rest works).

Worth knowing about so you don't get blindsided when you upgrade CKEditor.

---

### M4. `dangerouslySetInnerHTML` + DOMPurify is fine, but the sanitizer config is the default
[src/components/Preview.jsx:5](src/components/Preview.jsx#L5)

You correctly run the markdown through `DOMPurify.sanitize()` before injecting it — good. But you're using the default config, which allows things like `<style>` tags and a fairly wide attribute set. For an app that imports user content, consider an explicit allow-list:

```js
DOMPurify.sanitize(markdown, {
  ALLOWED_TAGS: ["p","h1","h2","h3","strong","em","a","ul","ol","li","blockquote","code","pre","img","figure","br"],
  ALLOWED_ATTR: ["href","src","data-img-id","class"],
});
```

…and audit the list against what your editor actually emits.

---

### M5. The toaster style is hardcoded outside the theme
[src/App.jsx:44-62](src/App.jsx#L44-L62)

Now that you have light/dark mode, the hardcoded `#a78bfa` / `#18181b` in `toastOptions` will look out of place in light mode. Either move these into CSS variables or read from the theme.

---

## Low

### L1. ESLint hint: unused `event` parameter in `onChange={(event, editor) => ...}`
[src/components/Markdown.jsx:248](src/components/Markdown.jsx#L248)

CKEditor's API requires a positional `event` arg that you don't use. Rename to `_event` to silence the warning without changing behavior.

### L2. Sidebar `<button>` should not contain interactive children
[src/components/Sidebar.jsx](src/components/Sidebar.jsx)

The note list items use `<button>` wrappers, which is correct for accessibility. Just be careful not to nest other interactive elements inside them later (e.g. a per-note "delete" icon button) — that's invalid HTML and trips screen readers.

### L3. `dev-dist/` and PWA build artifacts in the repo
[dev-dist/](dev-dist/)

A previous commit (`fe0cf3b`) added them to `.gitignore` but it looks like the directory still exists in the working copy. Confirm it's gitignored and consider deleting the local copy.

### L4. Magic 8% tax in nowhere — actually, that's the storefront, ignore. Carryover from another review.

### L5. `package.json` description / `name` are still defaults
[package.json:2-3](package.json#L2-L3)

`"name": "hushwrite"`, `"version": "0.0.0"`, `"private": true`. Add a `description`, an `author`, a `license`, and bump to `0.1.0` once you cut a release. Small thing, but it's the kind of polish that signals "I take this seriously" on a portfolio.

### L6. README is one line
[README.md](README.md)

`# hushwrite`. Write a real one — the elevator pitch ("offline-first, end-to-end encrypted markdown notebook"), a screenshot, install instructions, the security model (which KDF, iterations, AES mode, where keys live), and a "known limitations" section. The README is the first thing a reviewer reads.

---

## What you did well

I want to be clear that the foundation here is good. Specifically:

- **You picked the right primitives.** AES-GCM + PBKDF2 + WebCrypto is exactly the correct stack for browser-side encryption. You didn't roll your own crypto, you didn't pull in `crypto-js`, you didn't use a deprecated cipher. That's already better than a lot of production code in the wild.
- **`extractable: false` on `deriveKey`.** This is a nice touch — the derived AES key cannot be exfiltrated by JavaScript even if it's compromised. You clearly understood why it's there.
- **Each note has its own salt and IV.** Many beginners reuse a single IV across the app. You didn't.
- **The image-blob-in-IndexedDB pattern** is the right call. The bug in H1 is that you stopped using it correctly, not that the design is wrong.
- **Service Worker / PWA setup is minimal and works.** No over-engineering.
- **You cleaned up after yourself in `handleImageUpload`** (`e.target.value = ""` so the same file can be re-attached). Small detail, easy to miss.

---

## Recommended order of fixes

1. **C1, C3** — five-minute fixes, immediate security/debugging wins.
2. **C2, H1, H2** — these are the meaty refactors. Take an afternoon, do them together, and write a small unit test for the crypto round-trip while you're in there.
3. **H4, H5** — fix the React lifecycle bugs before they bite.
4. **M1, M2** — refactor state ownership. Easier to do now while the app is small.
5. Phase 2 (`.hwrite` format) — only after the above. The spec already includes a checksum field and forward-compat version key, so most of the design work is done; you just need clean import/export plumbing on top of a fixed core.

---

## Final note

For a project at this scope, by an intern, this is good work. The bones are right. The crypto issues above sound scary but they're all "you used a real algorithm slightly wrong" — which is **exactly** the kind of mistake worth making and fixing on a learning project, because the lessons stick. Fix the C-class items first, then we'll talk about Phase 2.

— Reviewer
