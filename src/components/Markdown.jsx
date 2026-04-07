import { useState, useEffect, useRef } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";
import toast from "react-hot-toast";
import { saveNote, getAllNotes, deleteNote } from "../js/db";
import { v4 as uuid4 } from "uuid";
import ExportNote from "./ExportNotes.jsx";
import Preview from "./Preview.jsx";
import {
  deriveKey,
  encryptContent,
  decryptContent,
  generateSalt,
} from "../js/crypto";
import "../style/markdown.css";

const Markdown = ({
  selectedNote,
  markdown,
  setMarkdown,
  currentId,
  setCurrentId,
  title,
  setTitle,
  setNotes,
}) => {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!currentId) setTitle("");
  }, [currentId, setTitle]);

  useEffect(() => {
    const loadSelectedNote = async () => {
      if (!selectedNote) return;

      try {
        const pw = prompt("Enter passphrase to decrypt note:");
        if (!pw) return;

        const key = await deriveKey(pw, new Uint8Array(selectedNote.salt));

        const decrypted = await decryptContent(
          new Uint8Array(selectedNote.ciphertext),
          key,
          new Uint8Array(selectedNote.iv),
          selectedNote.hash,
        );

        setMarkdown(decrypted);
        setCurrentId(selectedNote.id);
        setTitle(selectedNote.title || "");

        if (editorRef.current) {
          editorRef.current.setData(decrypted);
        }

        toast.success("Note loaded!");
      } catch (err) {
        toast.error(err.message);
      }
    };

    loadSelectedNote();
  }, [selectedNote]);

  const onSave = async () => {
    if (!markdown.trim()) {
      toast.error("Empty note!");
      return;
    }

    if (!title.trim()) {
      toast.error("Please enter a note title!");
      return;
    }

    try {
      const pw = prompt("Enter passphrase:");
      if (!pw) return;

      const salt = generateSalt();
      const key = await deriveKey(pw, salt);

      const { ciphertext, iv, hash } = await encryptContent(markdown, key);

      const id = currentId || uuid4();

      let existingNote;
      if (currentId) {
        const allNotes = await getAllNotes();
        existingNote = allNotes.find((n) => n.id === currentId);
      }

      const note = {
        id,
        title: title.trim(),
        ciphertext: Array.from(ciphertext),
        iv: Array.from(iv),
        salt: Array.from(salt),
        hash,
        createdAt: currentId
          ? existingNote?.createdAt || new Date().toISOString()
          : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveNote(note);
      setCurrentId(id);

      const saved = await getAllNotes();
      setNotes(saved);

      toast.success("Encrypted & saved!");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!currentId) {
      toast.error("No note selected!");
      return;
    }

    if (!window.confirm("Delete this note?")) return;

    try {
      await deleteNote(currentId);

      setMarkdown("");
      setTitle("");
      setCurrentId(null);

      if (editorRef.current) {
        editorRef.current.setData("");
      }

      const updated = await getAllNotes();
      setNotes(updated);

      toast.success("Note deleted!");
    } catch (err) {
      toast.error("Delete failed");
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const html = `<figure class="image"><img src="${dataUrl}" style="max-width:100%;" /></figure>`;
      if (editorRef.current) {
        editorRef.current.setData(editorRef.current.getData() + html);
        setMarkdown(editorRef.current.getData());
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <main className="main-content">
      <div className="editor-preview">
        <div className="editor">
          <div className="note-title-container">
            <input
              type="text"
              placeholder="Enter note title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="note-title-input"
            />
          </div>

          <CKEditor
            editor={ClassicEditor}
            data={markdown}
            onReady={(editor) => (editorRef.current = editor)}
            onChange={(event, editor) => setMarkdown(editor.getData())}
            config={{
              toolbar: [
                "heading",
                "|",
                "bold",
                "italic",
                "link",
                "bulletedList",
                "numberedList",
                "blockQuote",
                "undo",
                "redo",
              ],
              removePlugins: [
                "CKFinder",
                "CKFinderUploadAdapter",
                "ImageToolbar",
                "ImageCaption",
                "ImageStyle",
                "ImageUpload",
                "ImageResizeEditing",
                "ImageResizeHandles",
                "MediaEmbed",
                "EasyImage",
              ],
            }}
          />

          <div className="editor-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleImageUpload}
            />
            <button
              className="save-btn"
              onClick={() => fileInputRef.current.click()}
            >
              Attach Image
            </button>
            <button className="save-btn" onClick={onSave}>
              Save
            </button>

            <ExportNote note={{ content: markdown, title }} />
            <button className="delete-btn" onClick={handleDelete}>
              Delete
            </button>
          </div>
        </div>

        <div className="left-side">
          <Preview markdown={markdown} />
        </div>
      </div>
    </main>
  );
};

export default Markdown;
