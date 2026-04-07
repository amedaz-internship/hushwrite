import { useState, useEffect, useRef } from "react";
import "../style/PassphraseModal.css";

const PassphraseModal = ({ mode, onConfirm, onCancel }) => {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const handleSubmit = () => {
    if (!value.trim()) return;
    onConfirm(value);
  };

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onCancel();
  };

  const isEncrypt = mode === "encrypt";

  return (
    <div className="passphrase-modal-backdrop" onClick={handleBackdrop}>
      <div className="passphrase-modal-container">
        <h2 className="passphrase-modal-title">
          {isEncrypt ? " Encrypt Note" : "Decrypt Note"}
        </h2>
        <p className="passphrase-modal-description">
          {isEncrypt
            ? "Enter a passphrase to encrypt and save this note. New passphrase will overwrite"
            : "Enter the passphrase used when this note was saved."}
        </p>

        <input
          ref={inputRef}
          type="password"
          placeholder="Passphrase…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className="passphrase-modal-input"
        />

        <div className="passphrase-modal-actions">
          <button onClick={onCancel} className="passphrase-modal-btn ghost">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="passphrase-modal-btn primary"
          >
            {isEncrypt ? "Save" : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PassphraseModal;
