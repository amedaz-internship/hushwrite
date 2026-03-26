export const generateSalt = (length = 16) => crypto.getRandomValues(new Uint8Array(length));

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
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(content)
  );

  return { ciphertext: new Uint8Array(ciphertext), iv };
};

export const decryptContent = async (ciphertext, key, iv) => {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    throw new Error("Decryption failed: wrong passphrase or note corrupted");
  }
};