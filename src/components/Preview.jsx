import { useMemo } from "react";
import { Eye } from "lucide-react";

// Basic markdown syntax highlighting — colorize headings, bold, italic,
// code, links, lists, blockquotes, and horizontal rules so the preview
// looks like a .md file in a code editor.
const highlightMarkdown = (src) => {
  const lines = src.split("\n");
  const result = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code fences
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3);
      inCodeBlock = !inCodeBlock;
      result.push(
        <div key={i} className="text-emerald-400">
          {inCodeBlock ? "```" : "```"}
          {inCodeBlock && lang && (
            <span className="text-sky-400">{lang}</span>
          )}
        </div>,
      );
      continue;
    }

    if (inCodeBlock) {
      result.push(
        <div key={i} className="text-emerald-300/80">
          {line || "\u200B"}
        </div>,
      );
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s(.*)/);
    if (headingMatch) {
      result.push(
        <div key={i}>
          <span className="text-red-400">{headingMatch[1]} </span>
          <span className="font-semibold text-on-surface">
            {highlightInline(headingMatch[2])}
          </span>
        </div>,
      );
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      result.push(
        <div key={i} className="text-muted-foreground italic">
          <span className="text-yellow-500/70">&gt;</span>
          {highlightInline(line.slice(1))}
        </div>,
      );
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      result.push(
        <div key={i} className="text-muted-foreground">
          {line}
        </div>,
      );
      continue;
    }

    // List items
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s(.*)/);
    if (listMatch) {
      const [, indent, bullet, text] = listMatch;
      // Task list checkbox
      const taskMatch = text.match(/^\[([ xX])\]\s(.*)/);
      if (taskMatch) {
        const checked = taskMatch[1] !== " ";
        result.push(
          <div key={i}>
            {indent}
            <span className="text-muted-foreground">{bullet} </span>
            <span className={checked ? "text-sky-400" : "text-muted-foreground"}>
              [{taskMatch[1]}]
            </span>{" "}
            {highlightInline(taskMatch[2])}
          </div>,
        );
      } else {
        result.push(
          <div key={i}>
            {indent}
            <span className="text-muted-foreground">{bullet} </span>
            {highlightInline(text)}
          </div>,
        );
      }
      continue;
    }

    // Empty line
    if (!line.trim()) {
      result.push(<div key={i}>{"\u200B"}</div>);
      continue;
    }

    // Normal line with inline highlights
    result.push(<div key={i}>{highlightInline(line)}</div>);
  }

  return result;
};

// Highlight inline markdown: **bold**, *italic*, `code`, [links](url), ![images](url)
const highlightInline = (text) => {
  if (!text) return text;

  const parts = [];
  // Regex matches: inline code, bold, italic, image, link
  const regex =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\!\[[^\]]*\]\([^)]+\))|(\[[^\]]+\]\([^)]+\))/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const m = match[0];
    const key = `${match.index}`;

    if (match[1]) {
      // Inline code
      parts.push(
        <span key={key} className="text-emerald-400">
          {m}
        </span>,
      );
    } else if (match[2]) {
      // Bold
      parts.push(
        <span key={key} className="font-bold text-orange-300">
          {m}
        </span>,
      );
    } else if (match[3]) {
      // Italic
      parts.push(
        <span key={key} className="italic text-orange-300/80">
          {m}
        </span>,
      );
    } else if (match[4]) {
      // Image
      parts.push(
        <span key={key} className="text-purple-400">
          {m}
        </span>,
      );
    } else if (match[5]) {
      // Link
      const linkParts = m.match(/(\[[^\]]+\])(\([^)]+\))/);
      if (linkParts) {
        parts.push(
          <span key={key}>
            <span className="text-sky-400">{linkParts[1]}</span>
            <span className="text-muted-foreground">{linkParts[2]}</span>
          </span>,
        );
      } else {
        parts.push(m);
      }
    }

    lastIndex = match.index + m.length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : text;
};

const Preview = ({ markdown }) => {
  const highlighted = useMemo(
    () => (markdown ? highlightMarkdown(markdown) : null),
    [markdown],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-5 py-3">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Markdown
        </h3>
      </div>
      {highlighted ? (
        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5 font-mono text-[13px] leading-relaxed text-foreground">
          {highlighted}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <Eye className="h-6 w-6 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Start writing to see the markdown source
          </p>
        </div>
      )}
    </div>
  );
};

export default Preview;
