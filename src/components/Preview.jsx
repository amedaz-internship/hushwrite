import { useState } from "react";
import { Eye } from "lucide-react";

const Preview = ({ markdown, onChange }) => {
  // While the user is typing here we use a local-controlled value so
  // Milkdown's re-serialization (which often appends "\n" or normalizes
  // spacing) doesn't bounce back through the markdown prop and jump the
  // caret. When the textarea isn't focused we render directly from the
  // markdown prop, which keeps it in sync with note switches and edits
  // made on the Milkdown side.
  const [local, setLocal] = useState(markdown || "");
  const [focused, setFocused] = useState(false);

  const value = focused ? local : markdown || "";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-5 py-3">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Markdown
        </h3>
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          onChange?.(v);
        }}
        onFocus={() => {
          setLocal(markdown || "");
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        spellCheck={false}
        placeholder="Start writing to see the markdown source"
        className="scrollbar-thin flex-1 resize-none overflow-y-auto bg-transparent px-6 py-5 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  );
};

export default Preview;
