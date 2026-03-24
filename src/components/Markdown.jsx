import React, { useState, useEffect } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";
import { saveNote, getAllNotes } from "../js/db";
import { v4 as uuid4 } from "uuid";
import "../style/markdown.css";

const Markdown = ({ markdown, setMarkdown, currentId, setCurrentId }) => {
  const [notes, setNotes] = useState([]);

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

  return (
    <main className="main-content">
      <div className="editor-preview">
        <div className="editor">
          <CKEditor
            editor={ClassicEditor}
            data={markdown}
            onChange={(event, editor) => {
              const data = editor.getData();
              setMarkdown(data);
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
                "Image",
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
          <button className="save-btn" onClick={onSave}>
            Save
          </button>
        </div>

        <div className="preview">
          <h3>Preview</h3>
          <div className="markdown-preview">
            <ReactMarkdown>{markdown}</ReactMarkdown>
          </div>

          <div className="notes-list">
            <h3>Saved Notes</h3>
            <div className="notes-cards">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="note-card"
                  onClick={() => loadNote(note)}
                >
                  <p>{note.content.substring(0, 60)}...</p>
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
