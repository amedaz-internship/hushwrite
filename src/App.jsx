import { useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import TopNav from "./components/TopNav";
import NoteList from "./components/NoteList";
import Markdown from "./components/Markdown";
import AuthScreen from "./components/AuthScreen";
import { getAllNotes } from "./js/db";
import { VaultProvider } from "./lib/vault";
import { isLoggedIn, clearAuth } from "./js/api";
import { syncNotes } from "./js/sync";

const App = () => {
  const [authed, setAuthed] = useState(isLoggedIn() || !!localStorage.getItem("hushwrite-skip-auth"));
  const [syncing, setSyncing] = useState(false);

  const [markdown, setMarkdown] = useState("");
  const [currentId, setCurrentId] = useState(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [activeSection, setActiveSection] = useState("notes");
  const [isComposingNew, setIsComposingNew] = useState(false);

  // Once a brand-new note gets persisted (currentId flips from null to a
  // real id) or the user picks a different note, the synthetic draft entry
  // in the sidebar is no longer needed.
  useEffect(() => {
    if (currentId) setIsComposingNew(false);
  }, [currentId]);
  // Session-only cache of plaintext titles keyed by note id. Populated
  // when a note is unlocked or saved so the sidebar can show real titles
  // instead of "Encrypted note". Cleared on reload — never persisted.
  const [titleCache, setTitleCache] = useState({});

  // Imperative hooks into the editor so TopNav + Sidebar can trigger
  // session actions without prop-drilling a shared reducer.
  const lockRef = useRef(() => {});
  const isUnlockedRef = useRef(() => false);
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
    setIsComposingNew(true);
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

  const handleNewNoteInVault = () => {
    setActiveSection("vault");
    handleNewNote();
  };

  const handleAuth = () => {
    if (!isLoggedIn()) {
      localStorage.setItem("hushwrite-skip-auth", "1");
    }
    setAuthed(true);
  };

  const handleLogout = () => {
    clearAuth();
    localStorage.removeItem("hushwrite-skip-auth");
    setAuthed(false);
  };

  const handleSignInRequest = () => {
    localStorage.removeItem("hushwrite-skip-auth");
    setAuthed(false);
  };

  const handleSync = async () => {
    if (!isLoggedIn()) {
      toast.error("Sign in to sync notes");
      return;
    }
    setSyncing(true);
    try {
      const { pulled, pushed, deleted } = await syncNotes();
      await loadNotes();
      const parts = [`${pushed} pushed`, `${pulled} pulled`];
      if (deleted > 0) parts.push(`${deleted} deleted`);
      toast.success(`Synced — ${parts.join(", ")}`);
    } catch (err) {
      toast.error(err.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (!authed) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  return (
    <VaultProvider>
    <div className="flex h-screen flex-col overflow-hidden bg-surface font-body text-on-surface selection:bg-vault-primary/30">
      <TopNav
        isUnlocked={isUnlockedRef.current?.() ?? false}
        onLock={handleLock}
        notesCount={notes.length}
        onSync={handleSync}
        syncing={syncing}
        isOnline={isLoggedIn()}
        isLocalOnly={!isLoggedIn()}
        onLogout={handleLogout}
        onSignIn={handleSignInRequest}
      />
      <main className="flex flex-1 overflow-hidden">
        <NoteList
          notes={notes}
          currentId={currentId}
          currentTitle={title}
          titleCache={titleCache}
          onSelectNote={(n) => {
            setIsComposingNew(false);
            setSelectedNote(n);
          }}
          onImportNote={handleImportNote}
          onNotesChanged={(next) => setNotes(next)}
          onNewNote={activeSection === "vault" ? handleNewNoteInVault : handleNewNote}
          activeSection={activeSection}
          onSectionChange={(id) => {
            setActiveSection(id);
            setSelectedNote(null);
            setCurrentId(null);
            setMarkdown("");
            setTitle("");
            setIsComposingNew(false);
          }}
          isComposingNew={isComposingNew}
          isNoteUnlocked={isUnlockedRef.current?.() ?? false}
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
          vaultMode={activeSection === "vault"}
          isComposingNew={isComposingNew}
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
    </VaultProvider>
  );
};

export default App;
