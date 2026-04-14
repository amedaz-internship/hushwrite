import { useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import TopNav from "./components/TopNav";
import Sidebar from "./components/Sidebar";
import NoteList from "./components/NoteList";
import Markdown from "./components/Markdown";
import { getAllNotes } from "./js/db";

const App = () => {
  const [markdown, setMarkdown] = useState("");
  const [currentId, setCurrentId] = useState(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  // Session-only cache of plaintext titles keyed by note id. Populated
  // when a note is unlocked or saved so the sidebar can show real titles
  // instead of "Encrypted note". Cleared on reload — never persisted.
  const [titleCache, setTitleCache] = useState({});

  // Imperative hooks into the editor so TopNav + Sidebar can trigger
  // session actions without prop-drilling a shared reducer.
  const lockRef = useRef(() => {});
  const isUnlockedRef = useRef(() => false);
  const searchInputRef = useRef(null);
  // Re-render on status changes so TopNav reflects lock state.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const loadNotes = async () => setNotes(await getAllNotes());
  useEffect(() => {
    loadNotes();
  }, []);

  // Keep titleCache in sync with the currently-open note's plaintext title.
  useEffect(() => {
    if (!currentId || !title.trim()) return;
    setTitleCache((prev) =>
      prev[currentId] === title ? prev : { ...prev, [currentId]: title },
    );
  }, [currentId, title]);

  // Prune cache entries for deleted notes.
  useEffect(() => {
    setTitleCache((prev) => {
      const ids = new Set(notes.map((n) => n.id));
      const next = {};
      let changed = false;
      for (const [id, t] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = t;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [notes]);

  const handleNewNote = () => {
    setMarkdown("");
    setTitle("");
    setCurrentId(null);
    setSelectedNote(null);
    toast.success("New note created");
  };

  const handleImportNote = ({ markdown: md, title: t }) => {
    setSelectedNote(null);
    setCurrentId(null);
    setTitle(t || "Untitled");
    setMarkdown(md || "");
    toast.success("Imported. Save to encrypt with your passphrase.");
  };

  const handleLock = () => {
    lockRef.current?.();
    toast("Session locked", { icon: "🔒" });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface font-body text-on-surface selection:bg-vault-primary/30">
      <TopNav
        isUnlocked={isUnlockedRef.current?.() ?? false}
        onLock={handleLock}
        notesCount={notes.length}
      />
      <main className="flex flex-1 overflow-hidden">
        <Sidebar
          onNewNote={handleNewNote}
          onFocusSearch={() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
          }}
        />
        <NoteList
          notes={notes}
          currentId={currentId}
          currentTitle={title}
          titleCache={titleCache}
          onSelectNote={setSelectedNote}
          onImportNote={handleImportNote}
          searchInputRef={searchInputRef}
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
          titleCache={titleCache}
          onLockRef={lockRef}
          onIsUnlockedRef={isUnlockedRef}
        />
      </main>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "var(--v-surface-container)",
            color: "var(--v-on-surface)",
            border: "1px solid var(--v-outline-variant)",
            borderRadius: "0.5rem",
            fontSize: "13px",
          },
          success: {
            iconTheme: {
              primary: "var(--v-primary)",
              secondary: "var(--v-surface-container)",
            },
          },
          error: {
            iconTheme: {
              primary: "hsl(var(--destructive))",
              secondary: "var(--v-surface-container)",
            },
          },
        }}
      />
    </div>
  );
};

export default App;
