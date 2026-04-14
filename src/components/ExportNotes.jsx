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

    // Build a wrapper whose every element carries its own color/background
    // via inline styles. html2canvas clones the node into a detached
    // document, so CSS from outside (our dark palette) leaks in unless
    // every rule here wins on specificity. Inline styles do.
    //
    // It must also be visually rendered (not `left: -99999px` or `display: none`)
    // or html2canvas measures zero-height and the PDF comes out blank.
    // We paint it at top/left 0 with z-index -1 so it sits under the app
    // for the brief moment the export takes.
    const wrapper = document.createElement("div");
    wrapper.setAttribute(
      "style",
      [
        "position: absolute",
        "top: 0",
        "left: 0",
        "width: 210mm",
        "padding: 16mm",
        "background: #ffffff",
        "color: #000000",
        "font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif",
        "font-size: 11pt",
        "line-height: 1.6",
        "z-index: -1",
        "pointer-events: none",
      ].join(";"),
    );

    // Parse the sanitized markdown HTML and force-style every node so no
    // color or background is inherited from the live app.
    const container = document.createElement("div");
    container.innerHTML = cleanHtml;

    const paint = (el) => {
      if (!el) return;
      const tag = el.tagName;
      const base = "color: #000000 !important; background: transparent;";
      const styles = {
        H1: `font-size: 22pt; font-weight: 700; margin: 0 0 12pt; border-bottom: 1px solid #d8d8d8; padding-bottom: 6pt; ${base}`,
        H2: `font-size: 16pt; font-weight: 600; margin: 18pt 0 8pt; ${base}`,
        H3: `font-size: 13pt; font-weight: 600; margin: 14pt 0 6pt; ${base}`,
        H4: `font-size: 12pt; font-weight: 600; margin: 12pt 0 6pt; ${base}`,
        P: `margin: 0 0 10pt; ${base}`,
        A: `color: #000000 !important; text-decoration: underline;`,
        UL: `margin: 0 0 10pt; padding-left: 22pt; ${base}`,
        OL: `margin: 0 0 10pt; padding-left: 22pt; ${base}`,
        LI: `margin: 2pt 0; ${base}`,
        BLOCKQUOTE: `margin: 10pt 0; padding: 6pt 12pt; border-left: 3px solid #000; background: #f5f5f5; color: #000 !important; font-style: italic; page-break-inside: avoid;`,
        CODE: `font-family: 'JetBrains Mono', Menlo, Consolas, monospace; font-size: 10pt; background: #f1f1f3; color: #000 !important; padding: 1pt 4pt; border-radius: 3px;`,
        PRE: `background: #f1f1f3; color: #000 !important; padding: 10pt 12pt; border-radius: 6px; white-space: pre-wrap; word-break: break-word; page-break-inside: avoid; margin: 10pt 0; font-family: 'JetBrains Mono', Menlo, Consolas, monospace; font-size: 10pt;`,
        IMG: `max-width: 100%; height: auto; display: block; margin: 12pt auto; border-radius: 4px; page-break-inside: avoid;`,
        HR: `border: none; border-top: 1px solid #d8d8d8; margin: 14pt 0;`,
        STRONG: `color: #000 !important; font-weight: 700;`,
        EM: `color: #000 !important; font-style: italic;`,
        SPAN: `color: #000 !important;`,
      };
      if (styles[tag]) {
        el.setAttribute(
          "style",
          (el.getAttribute("style") || "") + ";" + styles[tag],
        );
      } else {
        // Fallback: every element gets black text so nothing inherits grey.
        el.setAttribute(
          "style",
          (el.getAttribute("style") || "") + ";" + base,
        );
      }
      for (const child of el.children) paint(child);
    };
    for (const child of container.children) paint(child);

    // Header: title + export date, all black.
    const titleHtml = note.title
      ? `<h1 style="font-size:22pt;font-weight:700;margin:0 0 12pt;color:#000 !important;border-bottom:1px solid #d8d8d8;padding-bottom:6pt;">${escapeHtml(note.title)}</h1>`
      : "";
    const metaHtml = `<div style="font-size:9pt;color:#555 !important;margin-bottom:16pt;">Exported from Hushwrite · ${new Date().toLocaleDateString()}</div>`;

    wrapper.innerHTML = titleHtml + metaHtml + container.innerHTML;
    document.body.appendChild(wrapper);

    try {
      await html2pdf()
        .from(wrapper)
        .set({
          filename: `${note.title || "note"}.pdf`,
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
    } finally {
      document.body.removeChild(wrapper);
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
