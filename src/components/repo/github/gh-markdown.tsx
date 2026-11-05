import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const PROSE =
  "text-[0.8125rem] leading-relaxed [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:font-mono [&_p+p]:mt-2 [&_p]:m-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border/60 [&_pre]:bg-muted/60 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_table]:text-xs [&_td]:border [&_td]:px-1 [&_th]:border [&_th]:px-1";

/** react-markdown escapes raw HTML by default, so untrusted provider text stays inert. */
export function GhMarkdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`${PROSE} ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
