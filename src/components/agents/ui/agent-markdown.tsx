import { openUrl } from "@tauri-apps/plugin-opener";
import { isValidElement } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { MarkdownBarcode } from "@/components/agents/ui/agent-barcode";
import { MarkdownChart } from "@/components/agents/ui/agent-chart";

/** Quelltext eines Codeblocks, wenn er die gesuchte Sprache trägt. */
function fenceSource(children: unknown, language: string): string | null {
  if (!isValidElement(children)) return null;
  const props = children.props as { className?: string; children?: unknown };
  if (!props.className?.includes(`language-${language}`)) return null;
  return typeof props.children === "string" ? props.children : null;
}

const MARKDOWN_PLUGINS = [remarkGfm];
const MARKDOWN_COMPONENTS: Components = {
  pre: ({ children, ...props }) => {
    const chart = fenceSource(children, "chart");
    if (chart !== null) return <MarkdownChart source={chart} />;
    const barcode = fenceSource(children, "barcode");
    if (barcode !== null) return <MarkdownBarcode source={barcode} />;
    return <pre {...props}>{children}</pre>;
  },
  a: ({ href, children, ...props }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        if (!href) return;
        event.preventDefault();
        void openUrl(href);
      }}
    >
      {children}
    </a>
  ),
};

export function AgentMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}
