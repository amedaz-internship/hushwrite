import { useState, useEffect, useRef, useCallback } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";
import toast from "react-hot-toast";
import {
  saveNote,
  getAllNotes,
  getNote,
  deleteNote,
  saveImage,
  getImage,
  deleteImage,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Trash2, ImagePlus, FileText } from "lucide-react";

// Pull image IDs out of an HTML string by reading every <img data-img-id="...">.
const extractImageIds = (htmlContent) => {
  const div = document.createElement("div");
  div.innerHTML = htmlContent;
  return Array.from(div.querySelectorAll("img[data-img-id]")).map(
    (img) => img.dataset.imgId,
  );
};

// Strip data: URLs from <img> tags before encryption — the actual blob is
// stored in the IndexedDB images store and re-hydrated on load. Without this,
// every save would store each image twice (and 3-4× its raw size, base64).
const stripImageSources = (htmlContent) => {
  const div = document.createElement("div");
  div.innerHTML = htmlContent;
  for (const img of div.querySelectorAll("img[data-img-id]")) {
    img.removeAttribute("src");
  }
  return div.innerHTML;
};

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

  // Open a modal and return a Promise that settles when the user confirms or
  // cancels. If a previous modal is still open, reject its Promise first so
  // its caller doesn't hang forever (H5).
  const askPassphrase = useCallback((mode) => {
    return new Promise((resolve, reject) => {
      setModal((prev) => {
        prev?.reject?.(new Error("superseded"));
        return { type: "passphrase", mode, resolve, reject };
      });
    });
  }, []);

  const askDeleteConfirm = useCallback(() => {
    return new Promise((resolve, reject) => {
      setModal((prev) => {
        prev?.reject?.(new Error("superseded"));
        return { type: "delete", resolve, reject };
      });
    });
  }, []);

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

  // Re-hydrate <img> data: URLs from the images store after decryption.
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
        );
        const contentWithImages = await renderImages(decrypted);
        setMarkdown(contentWithImages);
        setCurrentId(selectedNote.id);
        setTitle(selectedNote.title || "");
        if (editorRef.current) editorRef.current.setData(contentWithImages);
        toast.success("Note loaded!");
      } catch (err) {
        if (err.message !== "cancelled" && err.message !== "superseded") {
          toast.error(err.message);
        }
      }
    };
    loadSelectedNote();
  }, [selectedNote, askPassphrase, setMarkdown, setCurrentId, setTitle]);

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
      const stripped = stripImageSources(markdown);
      const { ciphertext, iv } = await encryptContent(stripped, key);

      const imageIds = extractImageIds(markdown);

      const existingNote = currentId ? await getNote(currentId) : null;

      // Garbage-collect images that were removed from the note since last save.
      if (existingNote?.imageIds?.length) {
        const stillReferenced = new Set(imageIds);
        const removed = existingNote.imageIds.filter(
          (id) => !stillReferenced.has(id),
        );
        await Promise.all(removed.map((id) => deleteImage(id)));
      }

      const id = currentId || uuid4();
      await saveNote({
        id,
        title: title.trim(),
        ciphertext: Array.from(ciphertext),
        iv: Array.from(iv),
        salt: Array.from(salt),
        imageIds,
        createdAt: existingNote?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setCurrentId(id);
      setNotes(await getAllNotes());
      toast.success("Encrypted & saved!");
    } catch (err) {
      if (err.message !== "cancelled" && err.message !== "superseded") {
        toast.error(err.message);
      }
    }
  };

  const handleDelete = async () => {
    if (!currentId) {
      toast.error("No note selected!");
      return;
    }
    try {
      await askDeleteConfirm();
      const note = await getNote(currentId);
      // Drop the note's images from IndexedDB so they don't pile up forever.
      if (note?.imageIds?.length) {
        await Promise.all(note.imageIds.map((id) => deleteImage(id)));
      }
      await deleteNote(currentId);
      setMarkdown("");
      setTitle("");
      setCurrentId(null);
      if (editorRef.current) editorRef.current.setData("");
      setNotes(await getAllNotes());
      toast.success("Note deleted!");
    } catch (err) {
      if (err.message !== "cancelled" && err.message !== "superseded") {
        toast.error("Delete failed");
      }
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
    <main className="scrollbar-thin flex h-screen flex-1 flex-col overflow-y-auto">
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

      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/80 px-8 py-4 backdrop-blur">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>{currentId ? "Editing note" : "New note"}</span>
        </div>
      </header>

      <div className="flex w-full flex-1 gap-8 p-8">
        <div className="flex flex-[0_0_60%] flex-col gap-4">
          <Input
            type="text"
            placeholder="Untitled note"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-12 border-0 border-b border-border bg-transparent px-1 text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <CKEditor
            editor={ClassicEditor}
            data={markdown}
            onReady={(editor) => (editorRef.current = editor)}
            onChange={(_event, editor) => setMarkdown(editor.getData())}
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
            }}
          />

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleImageUpload}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current.click()}
            >
              <ImagePlus className="mr-1.5 h-4 w-4" />
              Image
            </Button>
            <ExportNote note={{ content: markdown, title }} />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
            <Button size="sm" onClick={onSave} className="shadow-sm">
              <Save className="mr-1.5 h-4 w-4" />
              Save
            </Button>
          </div>
        </div>

        <div className="flex flex-[0_0_40%] flex-col gap-6">
          <Preview markdown={markdown} />
        </div>
      </div>
    </main>
  );
};

export default Markdown;
