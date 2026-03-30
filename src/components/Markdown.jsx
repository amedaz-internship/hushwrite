import { useState, useEffect, useRef } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";
import toast from "react-hot-toast";
import { saveNote, getAllNotes } from "../js/db";
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
  markdown,
  setMarkdown,
  currentId,
  setCurrentId,
  title,
  setTitle,
  notes,
  setNotes,
}) => {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  // Reset title for new note
  useEffect(() => {
    if (!currentId) setTitle("");
  }, [currentId, setTitle]);

  // Listen for loadNote event from Sidebar
  useEffect(() => {
    const handler = async (e) => {
      const note = e.detail;
      try {
        const pw = prompt("Enter passphrase to decrypt note:");
        if (!pw) return;

        const key = await deriveKey(pw, new Uint8Array(note.salt));

        const decrypted = await decryptContent(
          new Uint8Array(note.ciphertext),
          key,
          new Uint8Array(note.iv),
          note.hash,
        );

        setMarkdown(decrypted);
        setCurrentId(note.id);
        setTitle(note.title || "");

        if (editorRef.current) {
          editorRef.current.setData(decrypted);
        }

        toast.success("Note loaded!");
      } catch (err) {
        toast.error(err.message);
      }
    };

    window.addEventListener("loadNote", handler);
    return () => window.removeEventListener("loadNote", handler);
  }, [setMarkdown, setCurrentId, setTitle]);

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

      const note = {
        id,
        title: title.trim(),
        ciphertext: Array.from(ciphertext),
        iv: Array.from(iv),
        salt: Array.from(salt),
        hash,
        createdAt: new Date().toISOString(),
      };

      await saveNote(note);
      setCurrentId(id);

      // reload notes for sidebar
      const saved = await getAllNotes();
      setNotes(saved);

      toast.success("Encrypted & saved!");
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
          {/* Note title input */}
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
