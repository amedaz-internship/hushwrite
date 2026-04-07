
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
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

export const encryptContent = async (content, key) => {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = enc.encode(content);

  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hash = new Uint8Array(hashBuffer);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  return {
    ciphertext: new Uint8Array(ciphertextBuffer),
    iv,
    hash,
  };
};

const compareHashes = (a, b) => {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
};

export const decryptContent = async (ciphertext, key, iv, storedHash) => {
  const dec = new TextDecoder();
  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    const text = dec.decode(decryptedBuffer);

    const enc = new TextEncoder();
    const newHashBuffer = await crypto.subtle.digest(
      "SHA-256",
      enc.encode(text)
    );
    const newHash = new Uint8Array(newHashBuffer);

    if (!compareHashes(newHash, storedHash)) {
      throw new Error("Tampered content!");
    }

    return text;
  } catch (err) {
    throw new Error("⚠️ Note corrupted, tampered, or wrong password.");
  }
};