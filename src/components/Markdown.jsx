import { useState, useEffect, useRef } from "react";
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
    loadNotes();
  }, []);

  const loadNotes = async () => {
    const saved = await getAllNotes();
    setNotes(saved);
  };

  const requestPassphrase = () => {
    const pw = prompt("Enter passphrase:");
    if (!pw) throw new Error("Passphrase required");
    return pw;
  };

  const onSave = async () => {
    if (!markdown.trim()) {
      toast.error("Empty note!");
      return;
    }

    try {
      const pw = requestPassphrase();
      const salt = generateSalt();
      const key = await deriveKey(pw, salt);

      const { ciphertext, iv, hash } = await encryptContent(markdown, key);

      const id = currentId || uuid4();

      const note = {
        id,
        ciphertext: Array.from(ciphertext),
        iv: Array.from(iv),
        salt: Array.from(salt),
        hash,
        createdAt: new Date().toISOString(),
      };

      await saveNote(note);
      setCurrentId(id);
      await loadNotes();

      toast.success("Encrypted & saved!");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const loadNote = async (note) => {
    try {
      const pw = requestPassphrase();
      const key = await deriveKey(pw, new Uint8Array(note.salt));

      const decrypted = await decryptContent(
        new Uint8Array(note.ciphertext),
        key,
        new Uint8Array(note.iv),
        note.hash,
      );

      setMarkdown(decrypted);
      setCurrentId(note.id);

      if (editorRef.current) {
        editorRef.current.setData(decrypted);
      }

      toast.success("Note loaded!");
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
      }
    };

    reader.readAsDataURL(file);
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

            <ExportNote note={{ content: markdown, title: "note" }} />
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
