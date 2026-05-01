import { useState } from "react";
import html2pdf from "html2pdf.js";
import { Marked } from "marked";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import markdown from "highlight.js/lib/languages/markdown";
import java from "highlight.js/lib/languages/java";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import DOMPurify from "dompurify";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { FileDown, FileText, FileLock2 } from "lucide-react";
import { getImage } from "../js/db";
import { serializeNote, downloadHwrite } from "../js/hwrite";
import HwriteExportDialog from "./HwriteExportDialog";

// Register highlight.js languages
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("java", java);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);

// Configure marked with syntax highlighting
const markedForPdf = new Marked({
  renderer: {
    // Render checkboxes for task lists
    listitem({ text, task, checked }) {
      if (task) {
        const checkbox = checked
          ? '<span class="checkbox checked">&#9745;</span>'
          : '<span class="checkbox">&#9744;</span>';
        // Remove the default checkbox that marked adds
        const cleanText = text.replace(/<input.*?type="checkbox".*?>/i, "");
        return `<li class="task-item">${checkbox} ${cleanText}</li>\n`;
      }
      return `<li>${text}</li>\n`;
    },
    code({ text, lang }) {
      let highlighted;
      if (lang && hljs.getLanguage(lang)) {
        try {
          highlighted = hljs.highlight(text, { language: lang }).value;
        } catch {
          highlighted = escapeHtml(text);
        }
      } else {
        highlighted = escapeHtml(text);
      }
      const langLabel = lang
        ? `<div class="code-lang">${escapeHtml(lang)}</div>`
        : "";
      return `<div class="code-block">${langLabel}<pre><code>${highlighted}</code></pre></div>`;
    },
  },
});

const escapeHtml = (str = "") =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Replace `idb://<uuid>` image URLs with data URLs by reading blobs from
// IndexedDB so embedded images render in the printed output.
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

// Print-based PDF export styles
const printStyles = `
  @page {
    size: A4;
    margin: 20mm 18mm 25mm 18mm;
  }

  @page:first {
    margin-top: 15mm;
  }

  body {
    font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
    font-size: 13px;
    line-height: 1.7;
    color: #1a1a1a;
    background: #fff;
  }

  /* Title */
  .pdf-title {
    font-size: 26px;
    font-weight: 700;
    margin: 0 0 4px;
    color: #111;
    letter-spacing: -0.3px;
  }
  .pdf-meta {
    font-size: 10px;
    color: #888;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e5e5e5;
  }

  /* Headings */
  h1 { font-size: 24px; font-weight: 700; margin: 28px 0 12px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
  h2 { font-size: 20px; font-weight: 600; margin: 24px 0 10px; }
  h3 { font-size: 17px; font-weight: 600; margin: 20px 0 8px; }
  h4 { font-size: 15px; font-weight: 600; margin: 16px 0 6px; }
  p  { margin: 0 0 12px; }

  /* Lists */
  ul, ol { margin: 0 0 12px; padding-left: 24px; }
  li { margin: 3px 0; }

  /* Task lists */
  .task-item { list-style: none; margin-left: -24px; padding-left: 0; }
  .checkbox { font-size: 16px; margin-right: 6px; vertical-align: middle; }
  .checkbox.checked { color: #2563eb; }

  /* Blockquote */
  blockquote {
    margin: 14px 0;
    padding: 10px 16px;
    border-left: 3px solid #2563eb;
    background: #f8f9fa;
    font-style: italic;
    color: #555;
    page-break-inside: avoid;
  }
  blockquote p:last-child { margin-bottom: 0; }

  /* Code */
  code {
    font-family: 'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace;
    font-size: 12px;
    background: #f3f4f6;
    padding: 2px 5px;
    border-radius: 3px;
    color: #e11d48;
  }

  .code-block {
    position: relative;
    margin: 14px 0;
    page-break-inside: avoid;
  }
  .code-lang {
    position: absolute;
    top: 0;
    right: 0;
    font-size: 9px;
    font-family: sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #9ca3af;
    padding: 4px 10px;
  }

  pre {
    background: #1e293b;
    color: #e2e8f0;
    padding: 14px 16px;
    border-radius: 8px;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: 'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    margin: 0;
  }
  pre code {
    background: transparent;
    padding: 0;
    color: inherit;
    font-size: inherit;
  }

  /* Syntax highlighting (dark theme for print) */
  .hljs-keyword, .hljs-selector-tag, .hljs-built_in { color: #c084fc; }
  .hljs-string, .hljs-attr { color: #86efac; }
  .hljs-comment, .hljs-quote { color: #64748b; font-style: italic; }
  .hljs-number, .hljs-literal { color: #fbbf24; }
  .hljs-function .hljs-title, .hljs-title.function_ { color: #60a5fa; }
  .hljs-type, .hljs-title.class_ { color: #f472b6; }
  .hljs-variable, .hljs-template-variable { color: #fb923c; }
  .hljs-regexp { color: #f87171; }
  .hljs-meta { color: #94a3b8; }
  .hljs-tag { color: #f87171; }
  .hljs-name { color: #f87171; }
  .hljs-attribute { color: #fbbf24; }
  .hljs-selector-class { color: #fbbf24; }
  .hljs-selector-id { color: #60a5fa; }
  .hljs-property { color: #7dd3fc; }
  .hljs-params { color: #e2e8f0; }
  .hljs-punctuation { color: #94a3b8; }

  /* Images */
  img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 14px auto;
    border-radius: 4px;
    page-break-inside: avoid;
  }

  /* Links */
  a { color: #2563eb; text-decoration: underline; }

  /* Horizontal rule */
  hr { border: none; border-top: 1px solid #e5e5e5; margin: 20px 0; }

  /* Tables */
  table { border-collapse: collapse; margin: 12px 0; width: 100%; page-break-inside: avoid; }
  th { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; font-weight: 600; background: #f9fafb; font-size: 12px; }
  td { border: 1px solid #d1d5db; padding: 8px 12px; font-size: 12px; }
  tr:nth-child(even) td { background: #f9fafb; }

  /* Page footer with page numbers — CSS counters via @page + running headers
     aren't universally supported, so we use a fixed footer with JS page count */
  .pdf-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 9px;
    color: #aaa;
    padding: 8px 0;
  }
`;

const ExportNote = ({ note }) => {
  const [hwriteOpen, setHwriteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportAsHwrite = async ({ encrypted, passphrase }) => {
    setHwriteOpen(false);
    try {
      const blob = await serializeNote(
        { title: note.title, markdown: note.content },
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
    setExporting(true);
    const toastId = toast.loading("Generating PDF...");

    try {
      const rawHtml = markedForPdf.parse(note.content || "");
      const withImages = await inlineIdbImages(rawHtml);
      const cleanHtml = DOMPurify.sanitize(withImages, {
        ADD_TAGS: ["span"],
        ADD_ATTR: ["class"],
      });

      const safeTitle = escapeHtml(note.title || "Untitled");
      const date = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Build a hidden container for html2pdf to render from
      const wrapper = document.createElement("div");
      wrapper.setAttribute(
        "style",
        "position:fixed;left:-9999px;top:0;width:794px;background:#fff;",
      );
      wrapper.innerHTML = `
        <style>${printStyles}</style>
        <div style="padding:48px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;">
          <div class="pdf-title">${safeTitle}</div>
          <div class="pdf-meta">Exported from HushWrite &middot; ${date}</div>
          ${cleanHtml}
        </div>
      `;
      document.body.appendChild(wrapper);

      // Wait for images to load
      await Promise.all(
        Array.from(wrapper.querySelectorAll("img")).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((r) => {
                img.onload = img.onerror = r;
              }),
        ),
      );

      const safeName = (note.title || "note")
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase();

      await html2pdf()
        .from(wrapper.firstElementChild.nextElementSibling)
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

      wrapper.remove();
      toast.success("PDF downloaded!", { id: toastId });
    } catch (err) {
      console.error("[pdf export] failed:", err);
      toast.error("PDF export failed", { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={exportAsMD}
        disabled={!note.content?.trim()}
        title="Export as a plain Markdown (.md) file. Warning: this file is NOT encrypted — it leaves HushWrite's encryption protection."
      >
        <FileText className="mr-1.5 h-4 w-4" />
        .MD
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={exportAsPDF}
        disabled={!note.content?.trim() || exporting}
        title="Export as a printable PDF document. Warning: this file is NOT encrypted — it leaves HushWrite's encryption protection."
      >
        <FileDown className="mr-1.5 h-4 w-4" />
        PDF
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setHwriteOpen(true)}
        disabled={!note.content?.trim()}
        title="Export as a .hwrite file — HushWrite's portable format. Stays encrypted with the passphrase you choose, so it remains protected outside the app."
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
