import { useEffect } from "react";
import "../style/DeleteModal.css";

const DeleteModal = ({ onConfirm, onCancel }) => {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div className="delete-modal-backdrop" onClick={handleBackdrop}>
      <div className="delete-modal-container">
        <h2 className="delete-modal-title">Delete Note?</h2>
        <p className="delete-modal-description">
          This action is permanent and cannot be undone.
        </p>
        <div className="delete-modal-actions">
          <button onClick={onCancel} className="delete-modal-btn ghost">
            Cancel
          </button>
          <button onClick={onConfirm} className="delete-modal-btn danger">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteModal;
