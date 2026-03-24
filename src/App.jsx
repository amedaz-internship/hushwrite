import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Markdown from "./components/Markdown";
import { Toaster } from "react-hot-toast";
import "./App.css";

const App = () => {
  const [markdown, setMarkdown] = useState("");
  const [currentId, setCurrentId] = useState(null);

  return (
    <div className="app-container">
      <Sidebar setMarkdown={setMarkdown} setCurrentId={setCurrentId} />
      <Markdown
        markdown={markdown}
        setMarkdown={setMarkdown}
        currentId={currentId}
        setCurrentId={setCurrentId}
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
