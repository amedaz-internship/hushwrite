import toast from "react-hot-toast";
import "../style/sidebar.css";

const Sidebar = ({ setMarkdown, setCurrentId, notes, onSelectNote }) => {
  const newNote = () => {
    setMarkdown("");
    setCurrentId(null);
    onSelectNote(null);
    toast.success("New note created!");
  };

  return (
    <div className="sidebar">
      <h2>HushWrite</h2>

      <button className="new-note-btn" onClick={newNote}>
        + New Note
      </button>

      <div className="sidebar-notes">
        {notes.length === 0 && <p>No saved notes</p>}

        {notes.map((note) => (
          <div
            key={note.id}
            className="sidebar-note"
            onClick={() => onSelectNote(note)}
          >
            <strong>{note.title || "Untitled Note"}</strong>
            <small>{new Date(note.createdAt).toLocaleDateString()}</small>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
