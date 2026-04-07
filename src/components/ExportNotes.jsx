import html2pdf from "html2pdf.js";
import TurndownService from "turndown";
import { Button } from "@/components/ui/button";
import { FileDown, FileText } from "lucide-react";

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
    tempDiv.innerHTML = note.content;
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
    </>
  );
};

export default ExportNote;
