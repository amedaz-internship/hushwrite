import toast from "react-hot-toast";
import "../style/sidebar.css";

const Sidebar = ({ setMarkdown, setCurrentId, notes, loadNote }) => {
  const newNote = () => {
    setMarkdown("");
    setCurrentId(null);
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
            onClick={() => loadNote(note)}
          >
            Note {new Date(note.createdAt).toLocaleDateString()}{" "}
            {new Date(note.createdAt).toLocaleTimeString()}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
