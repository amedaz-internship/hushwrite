const SavedNote = ({ notes, loadNote }) => {
  return (
    <div className="notes-list">
      <h3>Saved Notes</h3>
      <div className="notes-cards">
        {notes.map((note) => (
          <div
            key={note.id}
            className="note-card"
            onClick={() => loadNote(note)}
          >
            <p>{note.content.replace(/<[^>]+>/g, "").substring(0, 60)}...</p>
            <small>{new Date(note.createdAt).toLocaleString()}</small>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SavedNote;
