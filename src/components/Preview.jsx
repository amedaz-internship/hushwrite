import DOMPurify from "dompurify";
import { Eye } from "lucide-react";

const Preview = ({ markdown }) => {
  const cleanHTML = DOMPurify.sanitize(markdown);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-5 py-3">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Preview
        </h3>
      </div>
      {markdown ? (
        <div
          className="scrollbar-thin markdown-preview ck-content flex-1 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-zinc-800
            [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-zinc-900
            [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-900
            [&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-900
            [&_p]:mb-3
            [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
            [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-primary
            [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-900 [&_pre]:p-4 [&_pre]:text-zinc-100
            [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit
            [&_blockquote]:my-3 [&_blockquote]:border-l-[3px] [&_blockquote]:border-primary [&_blockquote]:py-0.5 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground
            [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6
            [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6
            [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg"
          dangerouslySetInnerHTML={{ __html: cleanHTML }}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <Eye className="h-6 w-6 text-zinc-300" />
          <p className="text-sm text-muted-foreground">
            Start writing to see a live preview
          </p>
        </div>
      )}
    </div>
  );
};

export default Preview;
