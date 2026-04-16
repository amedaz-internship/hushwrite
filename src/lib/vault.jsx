import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  deriveKey,
  encryptContent,
  decryptContent,
  generateSalt,
} from "../js/crypto";
import { getVaultMeta, saveVaultMeta } from "../js/db";

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

  const value = {
    hasVault,
    isVaultUnlocked: !!key,
    vaultKey: key,
    vaultSalt: salt,
    createVault,
    unlockVault,
    lockVault,
  };

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
};

export const useVault = () => {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
};
