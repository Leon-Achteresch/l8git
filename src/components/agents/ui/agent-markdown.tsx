import { openUrl } from "@tauri-apps/plugin-opener";
import { isValidElement, memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { MarkdownBarcode } from "@/components/agents/ui/agent-barcode";
import { MarkdownChart } from "@/components/agents/ui/agent-chart";
import { HighlightedFence } from "@/components/agents/ui/highlighted-fence";
import { splitMarkdownBlocks } from "@/lib/agents/markdown-blocks";

function fenceSource(children: unknown, language: string): string | null {
  if (!isValidElement(children)) return null;
  const props = children.props as { className?: string; children?: unknown };
  if (!props.className?.includes(`language-${language}`)) return null;
  return typeof props.children === "string" ? props.children : null;
}

function fenceCode(
  children: unknown,
): { language: string; code: string } | null {
  if (!isValidElement(children)) return null;
  const props = children.props as { className?: string; children?: unknown };
  const language = /language-([\w+-]+)/.exec(props.className ?? "")?.[1];
  if (!language || typeof props.children !== "string") return null;
  return { language, code: props.children.replace(/\n$/, "") };
}

const MARKDOWN_PLUGINS = [remarkGfm];
const MARKDOWN_COMPONENTS: Components = {
  pre: ({ children, ...props }) => {
    const chart = fenceSource(children, "chart");
    if (chart !== null) return <MarkdownChart source={chart} />;
    const barcode = fenceSource(children, "barcode");
    if (barcode !== null) return <MarkdownBarcode source={barcode} />;
    const fence = fenceCode(children);
    if (fence) {
      return (
        <HighlightedFence
          language={fence.language}
          code={fence.code}
          preProps={props}
        />
      );
    }
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

const MarkdownBlock = memo(function MarkdownBlock({
  source,
}: {
  source: string;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={MARKDOWN_PLUGINS}
      components={MARKDOWN_COMPONENTS}
    >
      {source}
    </ReactMarkdown>
  );
});

export const AgentMarkdown = memo(function AgentMarkdown({
  children,
}: {
  children: string;
}) {
  const blocks = useMemo(() => splitMarkdownBlocks(children), [children]);
  return (
    <>
      {blocks.map((block, index) => (
        <MarkdownBlock key={index} source={block} />
      ))}
    </>
  );
});
