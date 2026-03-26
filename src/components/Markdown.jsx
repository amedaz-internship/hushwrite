import React, { useState, useEffect, useRef } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";
import toast from "react-hot-toast";
import { saveNote, getAllNotes } from "../js/db";
import { v4 as uuid4 } from "uuid";
import ExportNote from "./ExportNotes.jsx";
import Preview from "./Preview.jsx";
import SavedNote from "./SavedNote.jsx";
import {
  deriveKey,
  encryptContent,
  decryptContent,
  generateSalt,
} from "../js/crypto";

const Markdown = ({ markdown, setMarkdown, currentId, setCurrentId }) => {
  const [notes, setNotes] = useState([]);
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadNotes = async () => {
      const savedNotes = await getAllNotes();
      setNotes(savedNotes);
    };
    loadNotes();
  }, []);

  const requestPassphrase = (noteTitle = "this note") => {
    const input = prompt(`Enter passphrase for ${noteTitle}:`);
    if (!input) throw new Error("Passphrase required");
    return input;
  };
  const onSave = async () => {
    if (!markdown.trim()) {
      toast.error("Cannot save empty note!");
      return;
    }

    try {
      const pw = requestPassphrase();
      const salt = generateSalt();
      const key = await deriveKey(pw, salt);
      const { ciphertext, iv } = await encryptContent(markdown, key);

      const id = currentId || uuid4();
      const note = {
        id,
        ciphertext: Array.from(ciphertext),
        iv: Array.from(iv),
        salt: Array.from(salt),
        createdAt: new Date().toISOString(),
      };

      await saveNote(note);
      setCurrentId(id);

      const savedNotes = await getAllNotes();
      setNotes(savedNotes);
      toast.success("Note encrypted and saved!");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const loadNote = async (note) => {
    try {
      const pw = requestPassphrase(note.title || "this note");

      const key = await deriveKey(pw, new Uint8Array(note.salt));

      const decrypted = await decryptContent(
        new Uint8Array(note.ciphertext),
        key,
        new Uint8Array(note.iv),
      );

      setMarkdown(decrypted);
      setCurrentId(note.id);
      toast.success("Note decrypted and loaded!");
    } catch (err) {
      toast.error(err.message);
    }
  };
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const imageHTML = `<figure class="image"><img src="${dataUrl}" alt="${file.name}" style="max-width:100%;" /></figure>`;

      if (editorRef.current) {
        const viewFragment = editorRef.current.data.processor.toView(imageHTML);
        const modelFragment = editorRef.current.data.toModel(viewFragment);
        editorRef.current.model.insertContent(modelFragment);
      } else {
        setMarkdown((prev) => prev + imageHTML);
      }

      toast.success("Image inserted!");
    };

    reader.onerror = () => toast.error("Failed to read image.");
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <main className="main-content">
      <div className="editor-preview">
        <div className="editor">
          <CKEditor
            editor={ClassicEditor}
            data={markdown}
            onReady={(editor) => (editorRef.current = editor)}
            onChange={(event, editor) => setMarkdown(editor.getData())}
          />

          <div className="editor-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: "none" }}
            />
            <button
              className="save-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              Attach Image
            </button>
            <button className="save-btn" onClick={onSave}>
              Save
            </button>
            <ExportNote
              note={{ content: markdown, title: `note-${Date.now()}` }}
            />
          </div>
        </div>

        <div className="left-side">
          <Preview markdown={markdown} />
          <SavedNote notes={notes} loadNote={loadNote} />
        </div>
      </div>
    </main>
  );
};

export default Markdown;
