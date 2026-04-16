
import { v4 as uuid4 } from "uuid";
import {
  deriveKey,
  encryptContent,
  decryptContent,
  generateSalt,
} from "./crypto";
import { getImage, saveImage } from "./db";

export const HWRITE_VERSION = "1.0";

const TEXT_ENCODER = new TextEncoder();

// --- base64 helpers (Uint8Array <-> string) ---------------------------------

const u8ToBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

const base64ToU8 = (b64) => {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
};

const sha256Hex = async (str) => {
  const buf = await crypto.subtle.digest("SHA-256", TEXT_ENCODER.encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};


const IDB_IMG_REGEX = /(!\[[^\]]*\]\()idb:\/\/([0-9a-f-]+)(\))/gi;

const inlineImagesForExport = async (markdown) => {
  const matches = [...markdown.matchAll(IDB_IMG_REGEX)];
  if (!matches.length) return markdown;

  const cache = new Map();
  for (const m of matches) {
    const id = m[2];
    if (cache.has(id)) continue;
    const entry = await getImage(id);
    if (!entry) {
      cache.set(id, null);
      continue;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(entry.blob);
    });
    cache.set(id, dataUrl);
  }

  return markdown.replace(IDB_IMG_REGEX, (full, pre, id, post) => {
    const dataUrl = cache.get(id);
    return dataUrl ? `${pre}${dataUrl}${post}` : full;
  });
};

// Inverse of inlineImagesForExport. Imported notes carry images as inline
// `data:image/...;base64,...` URIs in the markdown. Leaving those in place
// makes the editor lag badly because every keystroke re-renders megabytes of
// base64. We extract each data URI, persist the bytes to the images store as
// a normal blob, and rewrite the markdown to use lightweight `idb://uuid`
// references that IdbImage resolves on demand.
const DATA_URL_IMG_REGEX =
  /(!\[[^\]]*\]\()(data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+)(\))/g;

const dataUrlToBlob = (dataUrl) => {
  const commaIdx = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, commaIdx);
  const b64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = meta.match(/data:([^;]+);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const bytes = base64ToU8(b64);
  return new Blob([bytes], { type: mime });
};

export const rehydrateInlineImages = async (markdown) => {
  if (!markdown || !markdown.includes("data:image/")) {
    return { markdown: markdown || "", imageIds: [], changed: false };
  }
  const matches = [...markdown.matchAll(DATA_URL_IMG_REGEX)];
  if (!matches.length) {
    return { markdown, imageIds: [], changed: false };
  }
  // Dedup identical data URLs so a reused image shares one blob entry.
  const cache = new Map();
  const newIds = [];
  for (const m of matches) {
    const dataUrl = m[2];
    if (cache.has(dataUrl)) continue;
    const id = uuid4();
    await saveImage({ id, blob: dataUrlToBlob(dataUrl) });
    cache.set(dataUrl, id);
    newIds.push(id);
  }
  const rewritten = markdown.replace(
    DATA_URL_IMG_REGEX,
    (full, pre, dataUrl, post) => {
      const id = cache.get(dataUrl);
      return id ? `${pre}idb://${id}${post}` : full;
    },
  );
  return { markdown: rewritten, imageIds: newIds, changed: true };
};

// --- public API -------------------------------------------------------------

/**
 * Build a .hwrite Blob from a note. Pass `{ encrypted: true, passphrase }` to
 * produce an encrypted file; otherwise the file holds raw markdown.
 */
export const serializeNote = async (
  { title, markdown, createdAt, modifiedAt },
  { encrypted, passphrase } = {},
) => {
  if (encrypted && !passphrase) {
    throw new Error("Passphrase required for encrypted export.");
  }

  const inlinedMarkdown = await inlineImagesForExport(markdown || "");
  const now = new Date().toISOString();

  const envelope = {
    hwrite: HWRITE_VERSION,
    encrypted: !!encrypted,
    title: (title || "Untitled").trim() || "Untitled",
    created: createdAt || now,
    modified: modifiedAt || now,
  };

  let content;
  if (encrypted) {
    const salt = generateSalt();
    const key = await deriveKey(passphrase, salt);
    const { ciphertext, iv } = await encryptContent(inlinedMarkdown, key);
    content = u8ToBase64(ciphertext);
    envelope.nonce = u8ToBase64(iv);
    envelope.salt = u8ToBase64(salt);
  } else {
    content = inlinedMarkdown;
  }

  envelope.content = content;
  envelope.checksum = await sha256Hex(content);

  return new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/json",
  });
};


export const parseHwrite = async (fileText) => {
  let parsed;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    throw new Error("Not a valid .hwrite file (invalid JSON).");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Not a valid .hwrite file.");
  }
  if (parsed.hwrite !== HWRITE_VERSION) {
    throw new Error(
      `Unsupported .hwrite version: ${parsed.hwrite || "unknown"}. Please update Hushwrite.`,
    );
  }

  const required = [
    "encrypted",
    "content",
    "checksum",
    "title",
    "created",
    "modified",
  ];
  for (const f of required) {
    if (!(f in parsed)) {
      throw new Error(`Not a valid .hwrite file (missing field: ${f}).`);
    }
  }
  if (typeof parsed.content !== "string" || typeof parsed.checksum !== "string") {
    throw new Error("Not a valid .hwrite file (bad field types).");
  }
  if (parsed.encrypted && (!parsed.nonce || !parsed.salt)) {
    throw new Error("Encrypted .hwrite file is missing nonce or salt.");
  }

  const expected = await sha256Hex(parsed.content);
  if (expected !== parsed.checksum) {
    throw new Error(
      "This file appears to be corrupted or modified. It cannot be safely imported.",
    );
  }

  return parsed;
};

// Convert a parsed encrypted envelope's base64 fields back to raw bytes so the
// envelope can be persisted directly as a note record. Passphrase stays with
// the user — the note is opened with the normal unlock flow later.
export const hwriteEnvelopeToBytes = (parsed) => {
  if (!parsed.encrypted) {
    throw new Error("hwriteEnvelopeToBytes: envelope is not encrypted.");
  }
  return {
    ciphertext: base64ToU8(parsed.content),
    iv: base64ToU8(parsed.nonce),
    salt: base64ToU8(parsed.salt),
  };
};

export const decryptHwrite = async (parsed, passphrase) => {
  if (!parsed.encrypted) return parsed.content;
  const salt = base64ToU8(parsed.salt);
  const iv = base64ToU8(parsed.nonce);
  const ciphertext = base64ToU8(parsed.content);
  const key = await deriveKey(passphrase, salt);
  
  return decryptContent(ciphertext, key, iv);
};

export const downloadHwrite = (blob, title) => {
  const slug = (title || "note")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "note";
  const d = new Date();
  const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const filename = `${slug}-${yyyymmdd}.hwrite`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
};
