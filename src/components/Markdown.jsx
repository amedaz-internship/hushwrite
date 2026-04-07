import { useState, useEffect, useRef, useCallback } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";
import toast from "react-hot-toast";
import {
  saveNote,
  getAllNotes,
  deleteNote,
  saveImage,
  getImage,
} from "../js/db";
import { v4 as uuid4 } from "uuid";
import ExportNote from "./ExportNotes.jsx";
import Preview from "./Preview.jsx";
import {
  deriveKey,
  encryptContent,
  decryptContent,
  generateSalt,
} from "../js/crypto";
import PassphraseModal from "./PassPhraseModal.jsx";
import DeleteModal from "./DeleteModal.jsx";
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

  const [modal, setModal] = useState(null);

  useEffect(() => {
    if (!currentId) setTitle("");
  }, [currentId, setTitle]);

  const askPassphrase = useCallback(
    (mode) =>
      new Promise((resolve, reject) =>
        setModal({ type: "passphrase", mode, resolve, reject }),
      ),
    [],
  );

  const askDeleteConfirm = useCallback(
    () =>
      new Promise((resolve, reject) =>
        setModal({ type: "delete", resolve, reject }),
      ),
    [],
  );

  const closeModal = () => setModal(null);

  const handlePassphraseConfirm = (pw) => {
    const { resolve } = modal;
    closeModal();
    resolve(pw);
  };
  const handleDeleteConfirm = () => {
    const { resolve } = modal;
    closeModal();
    resolve(true);
  };
  const handleModalCancel = () => {
    const { reject } = modal;
    closeModal();
    reject(new Error("cancelled"));
  };

  const renderImages = async (htmlContent) => {
    const div = document.createElement("div");
    div.innerHTML = htmlContent;
    for (const img of div.querySelectorAll("img[data-img-id]")) {
      const imageEntry = await getImage(img.dataset.imgId);
      if (imageEntry) {
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            img.src = reader.result;
            resolve();
          };
          reader.readAsDataURL(imageEntry.blob);
        });
      }
    }
    return div.innerHTML;
  };

  useEffect(() => {
    const loadSelectedNote = async () => {
      if (!selectedNote) return;
      try {
        const pw = await askPassphrase("decrypt");
        const key = await deriveKey(pw, new Uint8Array(selectedNote.salt));
        const decrypted = await decryptContent(
          new Uint8Array(selectedNote.ciphertext),
          key,
          new Uint8Array(selectedNote.iv),
          selectedNote.hash,
        );
        const contentWithImages = await renderImages(decrypted);
        setMarkdown(contentWithImages);
        setCurrentId(selectedNote.id);
        setTitle(selectedNote.title || "");
        if (editorRef.current) editorRef.current.setData(contentWithImages);
        toast.success("Note loaded!");
      } catch (err) {
        if (err.message !== "cancelled") toast.error(err.message);
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
      const pw = await askPassphrase("encrypt");
      const salt = generateSalt();
      const key = await deriveKey(pw, salt);
      const { ciphertext, iv, hash } = await encryptContent(markdown, key);

      let existingNote;
      if (currentId) {
        const allNotes = await getAllNotes();
        existingNote = allNotes.find((n) => n.id === currentId);
      }

      const id = currentId || uuid4();
      await saveNote({
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
      });

      setCurrentId(id);
      setNotes(await getAllNotes());
      toast.success("Encrypted & saved!");
    } catch (err) {
      if (err.message !== "cancelled") toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!currentId) {
      toast.error("No note selected!");
      return;
    }
    try {
      await askDeleteConfirm();
      await deleteNote(currentId);
      setMarkdown("");
      setTitle("");
      setCurrentId(null);
      if (editorRef.current) editorRef.current.setData("");
      setNotes(await getAllNotes());
      toast.success("Note deleted!");
    } catch (err) {
      if (err.message !== "cancelled") toast.error("Delete failed");
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    try {
      const id = uuid4();
      await saveImage({ id, blob: file });
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to read image"));
        reader.readAsDataURL(file);
      });
      const html = `<figure class="image"><img src="${dataUrl}" data-img-id="${id}" style="max-width:100%;" /></figure>`;
      if (editorRef.current) {
        editorRef.current.setData(editorRef.current.getData() + html);
        setMarkdown(editorRef.current.getData());
      }
      toast.success("Image attached!");
    } catch (err) {
      toast.error("Failed to attach image: " + err.message);
    }
  };

  return (
    <main className="main-content">
      {modal?.type === "passphrase" && (
        <PassphraseModal
          mode={modal.mode}
          onConfirm={handlePassphraseConfirm}
          onCancel={handleModalCancel}
        />
      )}
      {modal?.type === "delete" && (
        <DeleteModal
          onConfirm={handleDeleteConfirm}
          onCancel={handleModalCancel}
        />
      )}

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
