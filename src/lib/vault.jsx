import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  deriveKey,
  encryptContent,
  decryptContent,
  generateSalt,
} from "../js/crypto";
import {
  getVaultMeta,
  saveVaultMeta,
  getAllNotes,
  saveNote,
} from "../js/db";

const VERIFIER_PLAINTEXT = "hushwrite:vault:v1";
const toBytes = (v) => (v instanceof Uint8Array ? v : new Uint8Array(v));

const VaultContext = createContext(null);

export const VaultProvider = ({ children }) => {
  const [hasVault, setHasVault] = useState(false);
  const [meta, setMeta] = useState(null);
  const [key, setKey] = useState(null);
  const [salt, setSalt] = useState(null);

  useEffect(() => {
    (async () => {
      const m = await getVaultMeta();
      if (m) {
        setMeta(m);
        setHasVault(true);
      }
    })();
  }, []);

  const createVault = useCallback(async (passphrase) => {
    const newSalt = generateSalt();
    const newKey = await deriveKey(passphrase, newSalt);
    const { ciphertext, iv } = await encryptContent(VERIFIER_PLAINTEXT, newKey);
    const m = {
      salt: newSalt,
      verifierCiphertext: ciphertext,
      verifierIv: iv,
    };
    await saveVaultMeta(m);
    setMeta(await getVaultMeta());
    setHasVault(true);
    setKey(newKey);
    setSalt(newSalt);
  }, []);

  const unlockVault = useCallback(
    async (passphrase) => {
      if (!meta) throw new Error("No vault configured.");
      const storedSalt = toBytes(meta.salt);
      const candidateKey = await deriveKey(passphrase, storedSalt);
      const plaintext = await decryptContent(
        toBytes(meta.verifierCiphertext),
        candidateKey,
        toBytes(meta.verifierIv),
      );
      if (plaintext !== VERIFIER_PLAINTEXT) {
        throw new Error("Wrong vault passphrase.");
      }
      setKey(candidateKey);
      setSalt(storedSalt);
    },
    [meta],
  );

  const lockVault = useCallback(() => {
    setKey(null);
    setSalt(null);
  }, []);

  // Re-encrypt the verifier and every vault note under a brand-new
  // passphrase. Vault must be unlocked so we have the current key in memory
  // to decrypt each note before re-encrypting with the new key.
  const changeVaultPassphrase = useCallback(
    async (newPassphrase) => {
      if (!key || !salt) throw new Error("Unlock the vault first.");
      if (!newPassphrase || !newPassphrase.trim()) {
        throw new Error("Enter a new passphrase.");
      }

      const newSalt = generateSalt();
      const newKey = await deriveKey(newPassphrase, newSalt);

      const { ciphertext: verifierCiphertext, iv: verifierIv } =
        await encryptContent(VERIFIER_PLAINTEXT, newKey);

      const all = await getAllNotes();
      const vaultNotes = all.filter((n) => n.vault === true);

      for (const note of vaultNotes) {
        const plainBody = await decryptContent(
          toBytes(note.ciphertext),
          key,
          toBytes(note.iv),
        );
        let plainTitle = note.title || "";
        if (note.titleCiphertext && note.titleIv) {
          plainTitle = await decryptContent(
            toBytes(note.titleCiphertext),
            key,
            toBytes(note.titleIv),
          );
        }

        const { ciphertext, iv } = await encryptContent(plainBody, newKey);
        const { ciphertext: titleCiphertext, iv: titleIv } =
          await encryptContent(plainTitle, newKey);

        await saveNote({
          ...note,
          ciphertext,
          iv,
          salt: newSalt,
          title: plainTitle,
          titleCiphertext,
          titleIv,
          updatedAt: new Date().toISOString(),
        });
      }

      await saveVaultMeta({
        salt: newSalt,
        verifierCiphertext,
        verifierIv,
      });

      setMeta(await getVaultMeta());
      setKey(newKey);
      setSalt(newSalt);
      return vaultNotes.length;
    },
    [key, salt],
  );

  const value = {
    hasVault,
    isVaultUnlocked: !!key,
    vaultKey: key,
    vaultSalt: salt,
    createVault,
    unlockVault,
    lockVault,
    changeVaultPassphrase,
  };

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
};

export const useVault = () => {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
};
