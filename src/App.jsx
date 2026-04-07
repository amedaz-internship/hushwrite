import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Markdown from "./components/Markdown";
import { Toaster } from "react-hot-toast";
import { getAllNotes } from "./js/db";
import "./App.css";

const App = () => {
  const [markdown, setMarkdown] = useState("");
  const [currentId, setCurrentId] = useState(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const loadNotes = async () => {
    const saved = await getAllNotes();
    setNotes(saved);
  };

  useEffect(() => {
    loadNotes();
  }, []);

  return (
    <div className="app-container">
      <Sidebar
        setMarkdown={setMarkdown}
        setCurrentId={setCurrentId}
        notes={notes}
        onSelectNote={setSelectedNote}
      />

      <Markdown
        selectedNote={selectedNote}
        markdown={markdown}
        setMarkdown={setMarkdown}
        currentId={currentId}
        setCurrentId={setCurrentId}
        title={title}
        setTitle={setTitle}
        notes={notes}
        setNotes={setNotes}
      />

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            borderRadius: 10,
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
          },
          success: {
            style: { background: "#a78bfa", color: "#18181b" },
            iconTheme: { primary: "#a78bfa", secondary: "#18181b" },
          },
          error: {
            style: { background: "#000000", color: "#a78bfa" },
            iconTheme: { primary: "#000000", secondary: "#a78bfa" },
          },
        }}
      />
    </div>
  );
};

export default App;
