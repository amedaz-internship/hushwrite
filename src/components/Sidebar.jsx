import toast from "react-hot-toast";
import "../style/sidebar.css";

const Sidebar = ({ setMarkdown, setCurrentId }) => {
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
    </div>
  );
};

export default Sidebar;
