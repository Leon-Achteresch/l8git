import { openUrl } from "@tauri-apps/plugin-opener";
import { isValidElement, memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { MarkdownChart } from "@/components/agents/ui/agent-chart";
import { splitMarkdownBlocks } from "@/lib/agents/markdown-blocks";

function chartSource(children: unknown): string | null {
  if (!isValidElement(children)) return null;
  const props = children.props as { className?: string; children?: unknown };
  if (!props.className?.includes("language-chart")) return null;
  return typeof props.children === "string" ? props.children : null;
}

const MARKDOWN_PLUGINS = [remarkGfm];
const MARKDOWN_COMPONENTS: Components = {
  pre: ({ children, ...props }) => {
    const source = chartSource(children);
    if (source !== null) return <MarkdownChart source={source} />;
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

const MarkdownBlock = memo(function MarkdownBlock({ source }: { source: string }) {
  return (
    <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_COMPONENTS}>
      {source}
    </ReactMarkdown>
  );
});

export const AgentMarkdown = memo(function AgentMarkdown({ children }: { children: string }) {
  const blocks = useMemo(() => splitMarkdownBlocks(children), [children]);
  return (
    <>
      {blocks.map((block, index) => (
        // Keyed by position: a settled block keeps its element and its
        // memoized parse; only the block still being appended to re-renders.
        <MarkdownBlock key={index} source={block} />
      ))}
    </>
  );
});
