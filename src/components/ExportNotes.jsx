import "../style/markdown.css";
import html2pdf from "html2pdf.js";
import TurndownService from "turndown";

const ExportNote = ({ note }) => {
  const exportAsMD = () => {
    const turndownService = new TurndownService();
    const markdownContent = turndownService.turndown(note.content);

    const blob = new Blob([markdownContent], { type: "text/markdown" });
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

  const exportAsPDF = () => {
    const tempDiv = document.createElement("div");
    tempDiv.style.width = "210mm";
    tempDiv.style.padding = "20px";
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
    <div style={{ display: "flex", gap: "10px" }}>
      <button className="save-btn" onClick={exportAsMD}>
        Export as .MD
      </button>
      <button className="save-btn" onClick={exportAsPDF}>
        Export as PDF
      </button>
    </div>
  );
};

export default ExportNote;
