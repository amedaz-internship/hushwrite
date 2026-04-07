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

      <Toaster position="top-right" />
    </div>
  );
};

export default App;
