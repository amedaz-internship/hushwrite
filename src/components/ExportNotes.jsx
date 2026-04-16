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

const escapeHtml = (str = "") =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

    // Build the wrapper fully visible (opacity 1) at fixed top/left 0 with
    // an opaque white background and max z-index. html2canvas needs the
    // source element actually rendered on-screen to snapshot it correctly;
    // any off-screen / opacity-0 / z-index:-1 trick produces a blank PDF.
    // Users see a brief white flash during the capture — acceptable.
    const wrapper = document.createElement("div");
    wrapper.setAttribute(
      "style",
      [
        "position: fixed",
        "top: 0",
        "left: 0",
        "right: 0",
        "bottom: 0",
        "width: 100vw",
        "height: 100vh",
        "overflow: auto",
        "background: #ffffff",
        "z-index: 2147483647",
      ].join(";"),
    );

    const safeTitle = escapeHtml(note.title || "Untitled");
    const date = new Date().toLocaleDateString();

    const inner = document.createElement("div");
    inner.setAttribute(
      "style",
      [
        "width: 794px",
        "margin: 0 auto",
        "padding: 48px",
        "background: #ffffff",
        "color: #111111",
        "font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif",
        "font-size: 14px",
        "line-height: 1.6",
      ].join(";"),
    );
    inner.innerHTML = `
      <style>
        .pdf-root, .pdf-root * { color: #111 !important; background-color: transparent; }
        .pdf-root h1 { font-size: 28px; font-weight: 700; margin: 0 0 16px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
        .pdf-root h2 { font-size: 22px; font-weight: 600; margin: 24px 0 10px; }
        .pdf-root h3 { font-size: 18px; font-weight: 600; margin: 20px 0 8px; }
        .pdf-root h4 { font-size: 16px; font-weight: 600; margin: 16px 0 6px; }
        .pdf-root p  { margin: 0 0 12px; }
        .pdf-root ul, .pdf-root ol { margin: 0 0 12px; padding-left: 28px; }
        .pdf-root li { margin: 4px 0; }
        .pdf-root blockquote { margin: 14px 0; padding: 8px 14px; border-left: 3px solid #111; background: #f5f5f5 !important; font-style: italic; page-break-inside: avoid; }
        .pdf-root code { font-family: Menlo, Consolas, monospace; font-size: 13px; background: #f1f1f3 !important; padding: 2px 5px; border-radius: 3px; }
        .pdf-root pre { background: #f1f1f3 !important; padding: 12px 14px; border-radius: 6px; white-space: pre-wrap; word-break: break-word; font-family: Menlo, Consolas, monospace; font-size: 13px; margin: 14px 0; page-break-inside: avoid; }
        .pdf-root pre code { background: transparent !important; padding: 0; }
        .pdf-root img { max-width: 100%; height: auto; display: block; margin: 14px auto; border-radius: 4px; page-break-inside: avoid; }
        .pdf-root a { text-decoration: underline; }
        .pdf-root hr { border: none; border-top: 1px solid #ddd; margin: 18px 0; }
        .pdf-root .meta { font-size: 11px; color: #555 !important; margin-bottom: 20px; }
        .pdf-root table { border-collapse: collapse; margin: 12px 0; width: 100%; }
        .pdf-root th, .pdf-root td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
      </style>
      <div class="pdf-root">
        ${note.title ? `<h1>${safeTitle}</h1>` : ""}
        <div class="meta">Exported from Hushwrite · ${date}</div>
        ${cleanHtml}
      </div>
    `;
    wrapper.appendChild(inner);
    document.body.appendChild(wrapper);

    // Wait for all images to actually load before rasterizing.
    await Promise.all(
      Array.from(inner.querySelectorAll("img")).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = img.onerror = resolve;
            }),
      ),
    );

    const safeName = (note.title || "note")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();

    try {
      await html2pdf()
        .from(inner)
        .set({
          filename: `${safeName}.pdf`,
          margin: [10, 10, 12, 10],
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: {
            scale: 2,
            backgroundColor: "#ffffff",
            useCORS: true,
            logging: false,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .save();
    } catch (err) {
      console.error("[pdf export] failed:", err);
      toast.error("PDF export failed");
    } finally {
      wrapper.remove();
    }
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
