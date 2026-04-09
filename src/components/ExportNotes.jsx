import { useState } from "react";
import html2pdf from "html2pdf.js";
import { marked } from "marked";
import DOMPurify from "dompurify";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { FileDown, FileText, FileLock2 } from "lucide-react";
import { getImage } from "../js/db";
import { serializeNote, downloadHwrite } from "../js/hwrite";
import HwriteExportDialog from "./HwriteExportDialog";

// Replace `idb://<uuid>` image URLs with data URLs by reading blobs from
// IndexedDB. Used by the PDF export so embedded images render in the output.
const inlineIdbImages = async (html) => {
  const div = document.createElement("div");
  div.innerHTML = html;
  await Promise.all(
    Array.from(div.querySelectorAll("img")).map(async (img) => {
      const src = img.getAttribute("src") || "";
      if (!src.startsWith("idb://")) return;
      const id = src.slice("idb://".length);
      const entry = await getImage(id);
      if (!entry) {
        img.remove();
        return;
      }
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(entry.blob);
      });
      img.setAttribute("src", dataUrl);
    }),
  );
  return div.innerHTML;
};

const ExportNote = ({ note }) => {
  const [hwriteOpen, setHwriteOpen] = useState(false);

  const exportAsHwrite = async ({ encrypted, passphrase }) => {
    setHwriteOpen(false);
    try {
      const blob = await serializeNote(
        {
          title: note.title,
          markdown: note.content,
          // Created/modified aren't tracked at this level — let serializeNote
          // stamp `now` for both. Future work: thread real timestamps through.
        },
        { encrypted, passphrase },
      );
      const filename = downloadHwrite(blob, note.title);
      toast.success(
        encrypted ? `Exported encrypted ${filename}` : `Exported ${filename}`,
      );
    } catch (err) {
      toast.error(err.message || "Export failed");
    }
  };

  const exportAsMD = () => {
    // Content is already markdown — write it straight out.
    const blob = new Blob([note.content || ""], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeTitle = (note.title || "note")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    a.href = url;
    a.download = `${safeTitle}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsPDF = async () => {
    const rawHtml = marked.parse(note.content || "");
    const withImages = await inlineIdbImages(rawHtml);
    const cleanHtml = DOMPurify.sanitize(withImages);

    const tempDiv = document.createElement("div");
    tempDiv.style.width = "210mm";
    tempDiv.style.padding = "20px";
    tempDiv.innerHTML = cleanHtml;
    document.body.appendChild(tempDiv);

    html2pdf()
      .from(tempDiv)
      .set({
        filename: `${note.title || "note"}.pdf`,
        margin: 10,
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .save()
      .finally(() => {
        document.body.removeChild(tempDiv);
      });
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={exportAsMD}>
        <FileText className="mr-1.5 h-4 w-4" />
        .MD
      </Button>
      <Button variant="ghost" size="sm" onClick={exportAsPDF}>
        <FileDown className="mr-1.5 h-4 w-4" />
        PDF
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setHwriteOpen(true)}
        disabled={!note.content?.trim()}
      >
        <FileLock2 className="mr-1.5 h-4 w-4" />
        .hwrite
      </Button>
      {hwriteOpen && (
        <HwriteExportDialog
          onConfirm={exportAsHwrite}
          onCancel={() => setHwriteOpen(false)}
        />
      )}
    </>
  );
};

export default ExportNote;
