import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Bot,
  Boxes,
  Braces,
  AtSign,
  Clock,
  Copy,
  CornerUpLeft,
  FileCode2,
  FileImage,
  GitPullRequestArrow,
  Quote,
  Search,
  Timer,
  Undo2,
  Users,
  Volume2,
} from "lucide-react";
import { isValidElement, memo, type ReactNode, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { AgentActivity, type AgentActivityItem } from "@/components/agents/ui/agent-activity";
import { MarkdownChart } from "@/components/agents/ui/agent-chart";
import {
  copyToClipboard,
  ItemContextMenu as ItemMenu,
  type MenuEntry,
} from "@/components/agents/ui/item-context-menu";
import { insertIntoAgentComposer } from "@/lib/agents/composer-insert";
import type { AgentCodeLanguage } from "@/components/agents/ui/agent-code";
import { FileDiff, type FileDiffLine } from "@/components/agents/ui/file-diff";
import {
  MessageBubble,
  MessageBubbleContent,
  MessageBubbleGroup,
} from "@/components/agents/ui/message-bubble";
import { StreamingResponse } from "@/components/agents/ui/streaming-response";
import { TodoList, type TodoItem } from "@/components/agents/ui/todo-list";
import { ToolResult, ToolResultOutput } from "@/components/agents/ui/tool-result";
import type { AgentItem, AgentTurn } from "@/lib/agents/types";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import { parseUnifiedDiff } from "@/lib/unified-diff";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function prettyJson(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function LazyJsonOutput({ value, highlight }: { value: unknown; highlight: boolean }) {
  const outputText = useMemo(() => prettyJson(value), [value]);
  return (
    <ToolResultOutput language="json" highlight={highlight}>
      {outputText}
    </ToolResultOutput>
  );
}

function plainText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value) || value.length === 0) return null;
  const blocks = value.filter(isRecord);
  if (blocks.length !== value.length || !blocks.every((block) => block.type === "text")) return null;
  return blocks.map((block) => stringValue(block.text)).join("\n");
}

function LazyToolOutput({ value, highlight }: { value: unknown; highlight: boolean }) {
  const text = plainText(value);
  if (text === null) return <LazyJsonOutput value={value} highlight={highlight} />;
  return (
    <ToolResultOutput language="text" highlight={highlight}>
      {boundedTail(text, 160_000, 2_000)}
    </ToolResultOutput>
  );
}

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

function boundedTail(value: string, maxChars: number, maxLines: number): string {
  if (!value) return value;
  const charBounded = value.length > maxChars ? value.slice(-maxChars) : value;
  const lines = charBounded.split("\n");
  const body = lines.length > maxLines ? lines.slice(-maxLines).join("\n") : charBounded;
  return body.length === value.length
    ? body
    : `… ältere Ausgabe ausgeblendet; Kopieren enthält die vollständige Ausgabe …\n${body}`;
}

function commandStatus(item: AgentItem): "running" | "success" | "error" | "cancelled" {
  const status = stringValue(item.status);
  if (status === "inProgress") return "running";
  if (status === "failed") return "error";
  if (status === "declined" || status === "cancelled") return "cancelled";
  return "success";
}

function toolStatus(item: AgentItem): "running" | "success" | "error" | "cancelled" {
  const status = stringValue(item.status);
  if (status === "inProgress") return "running";
  if (status === "failed" || item.error) return "error";
  if (status === "cancelled" || status === "declined") return "cancelled";
  return "success";
}

function diffLines(diff: string): FileDiffLine[] {
  const maxSourceChars = 240_000;
  const source = diff.length <= maxSourceChars
    ? diff
    : (() => {
        const edge = maxSourceChars / 2;
        const headBreak = diff.lastIndexOf("\n", edge);
        const tailBreak = diff.indexOf("\n", diff.length - edge);
        const head = diff.slice(0, headBreak > 0 ? headBreak : edge);
        const tail = diff.slice(tailBreak >= 0 ? tailBreak + 1 : -edge);
        return `${head}\n … ${diff.length - head.length - tail.length} Diff-Zeichen ausgelassen …\n${tail}`;
      })();
  const lines = parseUnifiedDiff(source)
    .filter((line) => line.kind !== "meta" && line.kind !== "hunk")
    .map<FileDiffLine>((line, index) => ({
      id: `${index}-${line.oldLineNo ?? ""}-${line.newLineNo ?? ""}`,
      type: line.kind === "add" ? "added" : line.kind === "del" ? "removed" : "context",
      oldLine: line.oldLineNo,
      newLine: line.newLineNo,
      content: line.text,
    }));
  const maxRenderedLines = 1_600;
  if (lines.length <= maxRenderedLines) return lines;
  const edge = maxRenderedLines / 2;
  return [
    ...lines.slice(0, edge),
    {
      id: `omitted-${lines.length}`,
      type: "context",
      content: `… ${lines.length - maxRenderedLines} Anzeigezeilen ausgelassen …`,
    } satisfies FileDiffLine,
    ...lines.slice(-edge),
  ];
}

function languageForPath(path: string): AgentCodeLanguage {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "tsx" || extension === "jsx") return "tsx";
  if (extension === "ts" || extension === "js") return "typescript";
  if (extension === "json" || extension === "jsonc") return "json";
  if (extension === "sh" || extension === "bash" || extension === "zsh") return "bash";
  return "text";
}

function userContent(item: AgentItem): {
  text: string;
  images: string[];
  mentions: string[];
  audio: string[];
} {
  const text: string[] = [];
  const images: string[] = [];
  const mentions: string[] = [];
  const audio: string[] = [];
  for (const content of arrayValue(item.content)) {
    if (!isRecord(content)) continue;
    if (content.type === "text") text.push(stringValue(content.text));
    if (content.type === "localImage") images.push(stringValue(content.path));
    if (content.type === "image") images.push(stringValue(content.url));
    if (content.type === "skill" || content.type === "mention") {
      mentions.push(stringValue(content.name, stringValue(content.path)));
    }
    if (content.type === "audio") audio.push(stringValue(content.url));
    if (content.type === "localAudio") audio.push(stringValue(content.path));
  }
  return {
    text: text.filter(Boolean).join("\n"),
    images: images.filter(Boolean),
    mentions: mentions.filter(Boolean),
    audio: audio.filter(Boolean),
  };
}

function quoted(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function UserMessage({ item }: { item: AgentItem }) {
  const content = userContent(item);
  const queued = item.__queued === true;
  return (
    <ItemMenu
      entries={[
        {
          label: "Nachricht kopieren",
          icon: <Copy className="size-3.5" />,
          onSelect: () => copyToClipboard(content.text, "Nachricht kopiert"),
        },
        {
          label: "Erneut senden",
          icon: <CornerUpLeft className="size-3.5" />,
          onSelect: () => insertIntoAgentComposer(content.text),
        },
        {
          label: "Als Zitat einfügen",
          icon: <Quote className="size-3.5" />,
          onSelect: () => insertIntoAgentComposer(quoted(content.text)),
        },
      ]}
    >
    <div className={queued ? "opacity-60" : undefined}>
    <MessageBubble align="end" variant="solid" animateIn>
      <MessageBubbleContent>
        <p className="whitespace-pre-wrap">{content.text}</p>
        {content.images.length > 0 ? (
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            {content.images.map((path) => (
              <span
                key={path}
                className="inline-flex max-w-56 items-center gap-1.5 rounded-[8px] bg-white/12 px-2 py-1 font-mono text-[10px]"
                title={path}
              >
                <FileImage className="size-3 shrink-0" />
                <span className="truncate">{path.split(/[\\/]/).pop()}</span>
              </span>
            ))}
          </div>
        ) : null}
        {content.mentions.length > 0 || content.audio.length > 0 ? (
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            {content.mentions.map((mention) => (
              <span key={mention} className="inline-flex items-center gap-1 rounded-[8px] bg-white/12 px-2 py-1 text-[10px]">
                <AtSign className="size-3" />
                {mention}
              </span>
            ))}
            {content.audio.map((audio) => (
              <span key={audio} className="inline-flex max-w-56 items-center gap-1 rounded-[8px] bg-white/12 px-2 py-1 text-[10px]">
                <Volume2 className="size-3 shrink-0" />
                <span className="truncate">{audio.split(/[\\/]/).pop()}</span>
              </span>
            ))}
          </div>
        ) : null}
      </MessageBubbleContent>
    </MessageBubble>
    {queued ? (
      <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        <Clock className="size-3 animate-pulse" />
        In Warteschlange – wird an die KI übermittelt
      </div>
    ) : null}
    </div>
    </ItemMenu>
  );
}

function AgentMessage({ item, turn }: { item: AgentItem; turn: AgentTurn }) {
  const text = stringValue(item.text);
  const streaming = turn.status === "inProgress" && item.__completed !== true;
  const renderPlainText = streaming || text.length > 80_000;
  const memoryCitation = isRecord(item.memoryCitation) ? item.memoryCitation : null;
  const citationEntries = memoryCitation && Array.isArray(memoryCitation.entries)
    ? memoryCitation.entries.filter(isRecord)
    : [];
  return (
    <ItemMenu
      entries={[
        {
          label: "Antwort kopieren",
          icon: <Copy className="size-3.5" />,
          onSelect: () => copyToClipboard(text, "Antwort kopiert"),
        },
        {
          label: "Als Zitat antworten",
          icon: <Quote className="size-3.5" />,
          onSelect: () => insertIntoAgentComposer(`${quoted(text)}\n\n`),
        },
        ...(citationEntries.length > 0
          ? ([
              "separator",
              {
                label: "Quellenpfade kopieren",
                icon: <FileCode2 className="size-3.5" />,
                onSelect: () =>
                  copyToClipboard(
                    citationEntries
                      .map((entry) => {
                        const path = stringValue(entry.path);
                        const line = typeof entry.lineStart === "number" ? entry.lineStart : null;
                        return line ? `${path}:${line}` : path;
                      })
                      .filter(Boolean)
                      .join("\n"),
                    "Quellenpfade kopiert",
                  ),
              },
            ] satisfies MenuEntry[])
          : []),
      ]}
    >
    <MessageBubble align="start" variant="ghost">
      <MessageBubbleContent className="max-w-none">
        <StreamingResponse
          status={turn.status === "failed" ? "error" : streaming ? "streaming" : "complete"}
          copyText={text}
          showActions={!streaming}
        >
          {renderPlainText ? (
            <div className="whitespace-pre-wrap break-words">{text}</div>
          ) : (
            <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_COMPONENTS}>
              {text}
            </ReactMarkdown>
          )}
          {citationEntries.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {citationEntries.map((entry, index) => {
                const path = stringValue(entry.path);
                const line = typeof entry.lineStart === "number" ? entry.lineStart : null;
                return (
                  <span
                    key={`${path}-${line ?? index}`}
                    title={stringValue(entry.note)}
                    className="ag-inset rounded-[6px] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ag-text-2)]"
                  >
                    {path}{line ? `:${line}` : ""}
                  </span>
                );
              })}
            </div>
          ) : null}
        </StreamingResponse>
      </MessageBubbleContent>
    </MessageBubble>
    </ItemMenu>
  );
}

function reasoningTexts(value: unknown): string[] {
  return arrayValue(value)
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (!isRecord(entry)) return "";
      return stringValue(entry.text) || stringValue(entry.summary_text) || stringValue(entry.content);
    })
    .map((text) => text.trim())
    .filter(Boolean);
}

function ReasoningItem({ item, turn }: { item: AgentItem; turn: AgentTurn }) {
  const provider = useAgentProviderStore((state) => state.provider);
  const working = turn.status === "inProgress" && item.__completed !== true;
  const rows: AgentActivityItem[] = [
    ...reasoningTexts(item.summary),
    ...reasoningTexts(item.content),
  ].map((text, index) => ({
    id: `${item.id}-${index}`,
    type: "text",
    content: text,
  }));
  if (rows.length === 0 && !working) return null;
  return (
    <AgentActivity
      items={rows}
      status={working ? "working" : "complete"}
      duration={(turn.durationMs ?? 0) / 1000}
      activeLabel={`${agentProviderMeta(provider).label} denkt nach…`}
      summary="Gedankengang"
      maxHeight={180}
    />
  );
}

function CommandItem({ item }: { item: AgentItem }) {
  const command = stringValue(item.command, "Befehl");
  const output = stringValue(item.aggregatedOutput);
  const status = commandStatus(item);
  const displayedOutput = boundedTail(
    output,
    status === "running" ? 60_000 : 160_000,
    status === "running" ? 400 : 2_000,
  );
  return (
    <ItemMenu
      entries={[
        {
          label: "Befehl kopieren",
          icon: <Copy className="size-3.5" />,
          onSelect: () => copyToClipboard(command, "Befehl kopiert"),
        },
        {
          label: "Ausgabe kopieren",
          icon: <Copy className="size-3.5" />,
          onSelect: () => copyToClipboard(output, "Ausgabe kopiert"),
        },
        "separator",
        {
          label: "Befehl erneut anfragen",
          icon: <CornerUpLeft className="size-3.5" />,
          onSelect: () => insertIntoAgentComposer(`Führe erneut aus:\n\`\`\`bash\n${command}\n\`\`\``),
        },
        {
          label: "Ausgabe zitieren",
          icon: <Quote className="size-3.5" />,
          onSelect: () => insertIntoAgentComposer(`\`\`\`\n${boundedTail(output, 4_000, 60)}\n\`\`\`\n\n`),
        },
      ]}
    >
    <ToolResult
      tool="Shell"
      title={command}
      meta={stringValue(item.cwd)}
      status={status}
      kind="terminal"
      copyText={output || command}
      defaultOpen={status !== "success"}
    >
      <ToolResultOutput highlight={status !== "running"}>
        {displayedOutput || "Noch keine Ausgabe"}
      </ToolResultOutput>
      {typeof item.exitCode === "number" ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Exit-Code {item.exitCode}</p>
      ) : null}
    </ToolResult>
    </ItemMenu>
  );
}

function FileChangeItem({ item }: { item: AgentItem }) {
  const changes = useMemo(() => arrayValue(item.changes).filter(isRecord).map((change, index) => {
    const path = stringValue(change.path, `Datei ${index + 1}`);
    const diff = stringValue(change.diff);
    return { path, diff, lines: diffLines(diff), language: languageForPath(path) };
  }), [item.changes]);
  const streaming = stringValue(item.status) === "inProgress";
  return (
    <div className="space-y-1">
      {changes.map((change, index) => {
        return (
          <ItemMenu
            key={`${change.path}-${index}`}
            entries={[
              {
                label: "Pfad kopieren",
                icon: <Copy className="size-3.5" />,
                onSelect: () => copyToClipboard(change.path, "Pfad kopiert"),
              },
              {
                label: "Diff kopieren",
                icon: <Copy className="size-3.5" />,
                onSelect: () => copyToClipboard(change.diff, "Diff kopiert"),
              },
              "separator",
              {
                label: "Datei erwähnen",
                icon: <AtSign className="size-3.5" />,
                onSelect: () => insertIntoAgentComposer(`@${change.path} `),
              },
              {
                label: "Änderung rückgängig machen lassen",
                icon: <Undo2 className="size-3.5" />,
                onSelect: () =>
                  insertIntoAgentComposer(`Mache deine Änderungen an \`${change.path}\` rückgängig.`),
              },
            ]}
          >
            <FileDiff
              file={change.path}
              lines={change.lines}
              language={change.language}
              status={streaming ? "streaming" : "complete"}
              copyText={change.diff}
              defaultOpen={changes.length === 1}
            />
          </ItemMenu>
        );
      })}
    </div>
  );
}

function toolSubject(args: unknown): string {
  if (!isRecord(args)) return "";
  for (const key of ["file_path", "path", "pattern", "query", "url", "command", "prompt", "description"]) {
    const value = stringValue(args[key]);
    if (value) return value.length > 120 ? `${value.slice(0, 120)}…` : value;
  }
  return "";
}

function ToolCallItem({ item }: { item: AgentItem }) {
  const tool = stringValue(item.tool, "Tool");
  const subject = toolSubject(item.arguments);
  const server = stringValue(item.server, stringValue(item.namespace, "Agent"));
  const output = item.result ?? item.contentItems ?? item.error ?? item.arguments;
  const status = toolStatus(item);
  return (
    <ItemMenu
      entries={[
        {
          label: "Ergebnis kopieren",
          icon: <Copy className="size-3.5" />,
          onSelect: () => copyToClipboard(prettyJson(output), "Ergebnis kopiert"),
        },
        {
          label: "Argumente kopieren",
          icon: <Braces className="size-3.5" />,
          onSelect: () => copyToClipboard(prettyJson(item.arguments), "Argumente kopiert"),
        },
        {
          label: `„${tool}“ kopieren`,
          icon: <Copy className="size-3.5" />,
          onSelect: () => copyToClipboard(tool, "Tool-Name kopiert"),
        },
      ]}
    >
    <ToolResult
      tool={server}
      title={tool}
      meta={subject || undefined}
      status={status}
      icon={<Braces className="size-4" />}
      onCopy={() => navigator.clipboard?.writeText(prettyJson(output))}
      defaultOpen={status === "error"}
    >
      <LazyToolOutput value={output} highlight={status !== "running"} />
      {arrayValue(item.progress).length > 0 ? (
        <div className="mt-2 space-y-1 border-t border-border/50 pt-2 text-xs text-muted-foreground">
          {arrayValue(item.progress).map((message, index) => (
            <p key={`${item.id}-progress-${index}`}>{stringValue(message)}</p>
          ))}
        </div>
      ) : null}
    </ToolResult>
    </ItemMenu>
  );
}

function WebSearchItemView({ item, turn }: { item: AgentItem; turn: AgentTurn }) {
  const results = arrayValue(item.results).filter(isRecord);
  return (
    <AgentActivity
      contentType="search"
      status={turn.status === "inProgress" ? "working" : "complete"}
      activeLabel="Websuche läuft…"
      items={[
        {
          id: item.id,
          type: "search",
          query: stringValue(item.query, "Websuche"),
          results: results.map((result, index) => ({
            id: stringValue(result.id, `${item.id}-${index}`),
            title: stringValue(result.title, stringValue(result.url, "Ergebnis")),
            domain: stringValue(result.domain) || undefined,
            url: stringValue(result.url) || undefined,
          })),
        },
      ]}
    />
  );
}

function PlanMenu({ steps, children }: { steps: string[]; children: ReactNode }) {
  const checklist = steps.map((step) => `- [ ] ${step}`).join("\n");
  return (
    <ItemMenu
      entries={[
        {
          label: "Plan kopieren",
          icon: <Copy className="size-3.5" />,
          onSelect: () => copyToClipboard(checklist, "Plan kopiert"),
        },
        {
          label: "Plan im Composer aufgreifen",
          icon: <CornerUpLeft className="size-3.5" />,
          onSelect: () => insertIntoAgentComposer(`${checklist}\n\n`),
        },
        {
          label: "Plan überarbeiten lassen",
          icon: <Quote className="size-3.5" />,
          onSelect: () =>
            insertIntoAgentComposer("Überarbeite deinen Plan, bevor du weitermachst:\n\n"),
        },
      ]}
    >
      {children}
    </ItemMenu>
  );
}

function PlanItem({ item, turn }: { item: AgentItem; turn: AgentTurn }) {
  const structured = arrayValue(item.plan).filter(isRecord);
  if (structured.length > 0) {
    const todos: TodoItem[] = structured.map((entry, index) => ({
      id: `${item.id}-${index}`,
      title: stringValue(entry.step),
      status:
        entry.status === "completed"
          ? "completed"
          : entry.status === "inProgress"
            ? "in-progress"
            : "pending",
    }));
    return (
      <PlanMenu steps={structured.map((entry) => stringValue(entry.step)).filter(Boolean)}>
        <TodoList items={todos} title="Plan" collapseOnComplete />
      </PlanMenu>
    );
  }
  const text = stringValue(item.text, stringValue(item.plan));
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  const todos: TodoItem[] = lines.map((line, index) => ({
    id: `${item.id}-${index}`,
    title: line,
    status: turn.status === "completed" ? "completed" : index === 0 ? "in-progress" : "pending",
  }));
  return (
    <PlanMenu steps={lines}>
      <TodoList items={todos} title="Plan" collapseOnComplete />
    </PlanMenu>
  );
}

function CollaborationItem({ item }: { item: AgentItem }) {
  const receivers = arrayValue(item.receiverThreadIds).filter((value): value is string => typeof value === "string");
  const agentStates = isRecord(item.agentsStates) ? Object.entries(item.agentsStates) : [];
  return (
    <ToolResult
      tool="Multi-Agent"
      title={stringValue(item.tool, "Zusammenarbeit")}
      status={toolStatus(item)}
      icon={<Users className="size-4" />}
      meta={receivers.length ? `${receivers.length} Agenten` : undefined}
    >
      <p className="whitespace-pre-wrap text-sm text-foreground/80">
        {stringValue(item.prompt, "Agenten werden koordiniert.")}
      </p>
      {agentStates.length > 0 ? (
        <div className="mt-2 grid gap-1 border-t border-border/50 pt-2">
          {agentStates.map(([threadId, state]) => (
            <div key={threadId} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="truncate font-mono text-muted-foreground">{threadId}</span>
              <span>{isRecord(state) ? stringValue(state.status, prettyJson(state)) : prettyJson(state)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </ToolResult>
  );
}

function StatusItem({ item }: { item: AgentItem }) {
  const labels: Record<string, string> = {
    enteredReviewMode: "Code-Review gestartet",
    exitedReviewMode: "Code-Review abgeschlossen",
    contextCompaction: "Kontext wurde komprimiert",
    imageView: `Bild geöffnet: ${stringValue(item.path)}`,
    imageGeneration: "Bildgenerierung",
    subAgentActivity: "Sub-Agent-Aktivität",
  };
  const icons: Record<string, React.ReactNode> = {
    enteredReviewMode: <GitPullRequestArrow className="size-4" />,
    exitedReviewMode: <GitPullRequestArrow className="size-4" />,
    contextCompaction: <Boxes className="size-4" />,
    imageView: <FileImage className="size-4" />,
    imageGeneration: <FileImage className="size-4" />,
    subAgentActivity: <Bot className="size-4" />,
  };
  return (
    <AgentActivity
      status="complete"
      items={[
        {
          id: item.id,
          type: "trace",
          kind: "message",
          label: labels[item.type] ?? item.type,
          detail: stringValue(item.review) || undefined,
          icon: icons[item.type],
        },
      ]}
    />
  );
}

function ImageGenerationItemView({ item }: { item: AgentItem }) {
  const result = stringValue(item.result);
  const canPreview = result.startsWith("data:image/") || /^https?:\/\//.test(result);
  return (
    <ToolResult
      tool="Image generation"
      title={stringValue(item.revisedPrompt, "Generated image")}
      status={toolStatus(item)}
      icon={<FileImage className="size-4" />}
      copyText={stringValue(item.savedPath, result)}
      defaultOpen
    >
      {canPreview ? (
        <img
          src={result}
          alt={stringValue(item.revisedPrompt, "Generated by Codex")}
          className="max-h-[420px] w-auto rounded-xl border border-border/50 object-contain"
        />
      ) : (
        <ToolResultOutput>{stringValue(item.savedPath, result)}</ToolResultOutput>
      )}
    </ToolResult>
  );
}

function HookPromptItem({ item }: { item: AgentItem }) {
  const fragments = arrayValue(item.fragments).filter(isRecord);
  return (
    <AgentActivity
      status="complete"
      items={fragments.map((fragment, index) => ({
        id: stringValue(fragment.hookRunId, `${item.id}-${index}`),
        type: "trace",
        kind: "message",
        label: "Hook prompt",
        detail: stringValue(fragment.text),
      }))}
    />
  );
}

function SleepItemView({ item }: { item: AgentItem }) {
  const durationMs = typeof item.durationMs === "number" ? item.durationMs : 0;
  return (
    <AgentActivity
      status="complete"
      items={[{
        id: item.id,
        type: "trace",
        kind: "message",
        label: `Waited ${Math.max(0, durationMs / 1000).toLocaleString()} s`,
        icon: <Timer className="size-4" />,
      }]}
    />
  );
}

export const AgentItemView = memo(function AgentItemView({ item, turn }: { item: AgentItem; turn: AgentTurn }) {
  const provider = useAgentProviderStore((state) => state.provider);
  if (item.type === "userMessage") return <UserMessage item={item} />;
  if (item.type === "agentMessage") return <AgentMessage item={item} turn={turn} />;
  if (item.type === "reasoning") return <ReasoningItem item={item} turn={turn} />;
  if (item.type === "commandExecution") return <CommandItem item={item} />;
  if (item.type === "fileChange") return <FileChangeItem item={item} />;
  if (item.type === "mcpToolCall" || item.type === "dynamicToolCall") return <ToolCallItem item={item} />;
  if (item.type === "webSearch") return <WebSearchItemView item={item} turn={turn} />;
  if (item.type === "plan") return <PlanItem item={item} turn={turn} />;
  if (item.type === "collabAgentToolCall") return <CollaborationItem item={item} />;
  if (item.type === "hookPrompt") return <HookPromptItem item={item} />;
  if (item.type === "sleep") return <SleepItemView item={item} />;
  if (item.type === "imageGeneration") return <ImageGenerationItemView item={item} />;
  if (
    item.type === "enteredReviewMode" ||
    item.type === "exitedReviewMode" ||
    item.type === "contextCompaction" ||
    item.type === "imageView" ||
    item.type === "subAgentActivity"
  ) {
    return <StatusItem item={item} />;
  }
  return (
    <ToolResult
      tool={agentProviderMeta(provider).label}
      title={item.type}
      status={turn.status === "inProgress" ? "running" : "success"}
      icon={item.type === "webSearch" ? <Search className="size-4" /> : undefined}
      onCopy={() => navigator.clipboard?.writeText(prettyJson(item))}
      defaultOpen={false}
    >
      <LazyJsonOutput value={item} highlight={turn.status !== "inProgress"} />
    </ToolResult>
  );
}, (previous, next) =>
  previous.item === next.item &&
  previous.turn.status === next.turn.status &&
  previous.turn.durationMs === next.turn.durationMs &&
  previous.turn.error === next.turn.error,
);

export const AgentTurnView = memo(function AgentTurnView({ turn }: { turn: AgentTurn }) {
  return (
    <MessageBubbleGroup spacing="default" className="gap-3">
      {turn.items.map((item) => (
        <AgentItemView key={item.id} item={item} turn={turn} />
      ))}
      {turn.status === "failed" && turn.error ? (
        <MessageBubble align="start" variant="danger">
          <MessageBubbleContent>{turn.error}</MessageBubbleContent>
        </MessageBubble>
      ) : null}
    </MessageBubbleGroup>
  );
});
