import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Markdown from "./components/Markdown";
import { Toaster } from "react-hot-toast";
import { getAllNotes } from "./js/db";

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
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        setMarkdown={setMarkdown}
        setCurrentId={setCurrentId}
        notes={notes}
        onSelectNote={setSelectedNote}
        currentId={currentId}
        currentTitle={title}
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
          className:
            "!bg-popover !text-popover-foreground !border !border-border !rounded-lg !shadow-lg !text-sm",
          success: {
            iconTheme: {
              primary: "hsl(var(--primary))",
              secondary: "hsl(var(--popover))",
            },
          },
          error: {
            iconTheme: {
              primary: "hsl(var(--destructive))",
              secondary: "hsl(var(--popover))",
            },
          },
        }}
      />
    </div>
  );
};

export default App;
