
const PBKDF2_ITERATIONS = 600_000;

export const generateSalt = (length = 16) => {
  return crypto.getRandomValues(new Uint8Array(length));
};

export const deriveKey = async (passphrase, salt) => {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

export const encryptContent = async (content, key) => {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = enc.encode(content);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  return {
    ciphertext: new Uint8Array(ciphertextBuffer),
    iv,
  };
};

export const decryptContent = async (ciphertext, key, iv) => {
  const dec = new TextDecoder();
  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    return dec.decode(decryptedBuffer);
  } catch (err) {
    // Log the real cause for debugging; surface a friendly message to callers.
    console.error("[decrypt] failed:", err);
    throw new Error("Note corrupted, tampered, or wrong passphrase.");
  }
};
