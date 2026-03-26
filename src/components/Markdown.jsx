import React, { useState, useEffect, useRef } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";
import toast from "react-hot-toast";
import { saveNote, getAllNotes } from "../js/db";
import { v4 as uuid4 } from "uuid";
import "../style/markdown.css";

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

  const onSave = async () => {
    if (!markdown.trim()) {
      toast.error("Cannot save empty note!");
      return;
    }

    const id = currentId || uuid4();
    const note = {
      id,
      content: markdown,
      createdAt: new Date().toISOString(),
    };

    await saveNote(note);
    setCurrentId(id);

    const savedNotes = await getAllNotes();
    setNotes(savedNotes);
    toast.success("Note saved!");
  };

  const loadNote = (note) => {
    setMarkdown(note.content);
    setCurrentId(note.id);
    toast.success("Note loaded!");
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;

      if (editorRef.current) {
        const imageHTML = `<figure class="image"><img src="${dataUrl}" alt="${file.name}" style="max-width:100%;" /></figure>`;
        const viewFragment = editorRef.current.data.processor.toView(imageHTML);
        const modelFragment = editorRef.current.data.toModel(viewFragment);
        editorRef.current.model.insertContent(modelFragment);
      } else {
        setMarkdown(
          (prev) =>
            prev +
            `<figure class="image"><img src="${dataUrl}" alt="${file.name}" style="max-width:100%;" /></figure>`,
        );
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
            onReady={(editor) => {
              editorRef.current = editor;
            }}
            onChange={(event, editor) => {
              setMarkdown(editor.getData());
            }}
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
              onChange={handleImageUpload}
              style={{ display: "none" }}
            />

            <button
              className="image-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Attach image"
            >
              Attach Image
            </button>

            <button className="save-btn" onClick={onSave}>
              Save
            </button>
          </div>
        </div>

        <div className="preview">
          <h3>Preview</h3>

          <div
            className="markdown-preview ck-content"
            dangerouslySetInnerHTML={{ __html: markdown }}
          />

          <div className="notes-list">
            <h3>Saved Notes</h3>
            <div className="notes-cards">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="note-card"
                  onClick={() => loadNote(note)}
                >
                  <p>
                    {note.content.replace(/<[^>]+>/g, "").substring(0, 60)}...
                  </p>
                  <small>{new Date(note.createdAt).toLocaleString()}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Markdown;
