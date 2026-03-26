// SavedNote.jsx
import React from "react";

const SavedNote = ({ notes, loadNote }) => {
  const getPreview = (note) => {
    return "Encrypted Note";
  };

  return (
    <div className="notes-list">
      <h3>Saved Notes</h3>
      <div className="notes-cards">
        {notes.length === 0 && <p>No saved notes yet.</p>}

        {notes.map((note) => (
          <div
            key={note.id}
            className="note-card"
            onClick={() => loadNote(note)}
          >
            <p>{getPreview(note)}</p>
            <small>
              {note.createdAt
                ? new Date(note.createdAt).toLocaleString()
                : "Unknown date"}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SavedNote;
