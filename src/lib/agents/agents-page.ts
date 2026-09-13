import { compactAge } from "@/lib/agents/compact-age";
import { groupOf, type GroupKey } from "@/lib/agents/thread-grouping";
import { flattenTurnRows, toolResultLabel } from "@/lib/agents/transcript-rows";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import type {
  AgentConversation,
  AgentItem,
  AgentPendingRequest,
  AgentRateLimits,
  AgentThreadSummary,
  AgentTokenUsage,
  AgentTurn,
} from "@/lib/agents/types";

export type ThreadRowStatus = "done" | "running" | "idle" | "review" | "failed";

export interface ThreadRow {
  id: string;
  path: string;
  title: string;
  group: string;
  age: string;
  status: ThreadRowStatus;
  updatedAt: number;
  provider: NativeAgentProvider;
  pinned?: boolean;
}

const GROUP_LABEL: Record<GroupKey, string> = {
  pinned: "Pinned",
  today: "Today",
  yesterday: "Yesterday",
  last7Days: "Last 7 days",
  older: "Older",
};

export function threadRowStatus(
  thread: AgentThreadSummary,
  conversation: AgentConversation | undefined,
  requests: AgentPendingRequest[] | undefined,
): ThreadRowStatus {
  if (requests?.length) return "review";
  if (conversation?.activeTurnId) return "running";
  const turns = conversation?.turns ?? [];
  const last = turns[turns.length - 1];
  if (last?.status === "failed" || /error|failed/i.test(thread.status)) return "failed";
  if (last) return "done";
  return "idle";
}

export function threadRows(
  threadsByPath: Record<string, AgentThreadSummary[]>,
  conversations: Record<string, AgentConversation>,
  requestsByThread: Record<string, AgentPendingRequest[]>,
  options: { paths?: string[]; locale?: string; now?: number; provider?: NativeAgentProvider } = {},
): ThreadRow[] {
  const paths = options.paths ?? Object.keys(threadsByPath);
  const provider = options.provider ?? "codex";
  const now = options.now ?? Date.now();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return paths
    .flatMap((path) => threadsByPath[path] ?? [])
    .filter((thread) => !thread.archived)
    .sort((a, b) => {
      if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    })
    .map((thread) => ({
      id: thread.id,
      path: thread.path,
      title: thread.title || thread.preview || thread.id,
      group: GROUP_LABEL[groupOf({ ...thread, provider }, startOfToday.getTime())],
      age: compactAge(thread.updatedAt, options.locale ?? "en", now),
      status: threadRowStatus(thread, conversations[thread.id], requestsByThread[thread.id]),
      updatedAt: thread.updatedAt,
      provider,
      pinned: thread.isPinned,
    }));
}

export type TranscriptEntry =
  | { kind: "user"; key: string; text: string }
  | { kind: "agent"; key: string; text: string }
  | { kind: "reasoning"; key: string; text: string; redacted: boolean; completed: boolean }
  | { kind: "plan"; key: string; steps: Array<{ id: string; label: string; status: string }> }
  | { kind: "tool"; key: string; label: string; detail: string; running: boolean }
  | { kind: "error"; key: string; text: string };

function textOfContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) =>
      typeof part === "string"
        ? part
        : part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
    )
    .filter(Boolean)
    .join("\n");
}

function toolFallbackLabel(item: AgentItem): string {
  if (item.type === "fileChange") return "Edit";
  if (item.type === "task") return "Task";
  if (item.type === "localCommand") return "Command";
  if (item.type === "hookActivity") return "Hook";
  if (item.type === "contextCompaction") return "Compaction";
  if (item.type === "dynamicToolCall" || item.type === "collabAgentToolCall") {
    return String(item.name ?? item.tool ?? "Tool");
  }
  return item.type;
}

function toolDetail(item: AgentItem): string {
  const candidate = item.path ?? item.command ?? item.query ?? item.pattern ?? item.url ?? item.title;
  return typeof candidate === "string" ? candidate : "";
}

const HIDDEN_ITEM_TYPES = new Set(["usage", "session", "turn"]);

export function transcriptEntries(turns: AgentTurn[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  for (const row of flattenTurnRows(turns)) {
    if (row.kind === "error") {
      entries.push({ kind: "error", key: row.key, text: row.error });
      continue;
    }
    const { item, key, turn } = row;
    if (HIDDEN_ITEM_TYPES.has(item.type)) continue;
    if (item.type === "userMessage") {
      entries.push({ kind: "user", key, text: textOfContent(item.content) });
      continue;
    }
    if (item.type === "agentMessage") {
      const text = typeof item.text === "string" ? item.text : textOfContent(item.content);
      if (text) entries.push({ kind: "agent", key, text });
      continue;
    }
    if (item.type === "reasoning") {
      const text = [textOfContent(item.summary), textOfContent(item.content)].filter(Boolean).join("\n");
      entries.push({
        kind: "reasoning",
        key,
        text,
        redacted: item.redacted === true,
        completed: turn.status !== "inProgress" || item.__completed === true,
      });
      continue;
    }
    if (item.type === "plan" && Array.isArray(item.plan)) {
      entries.push({
        kind: "plan",
        key,
        steps: item.plan.filter((step): step is Record<string, unknown> => !!step && typeof step === "object").map((step, index) => ({
          id: `${key}:${index}`,
          label: String(step.step ?? ""),
          status: String(step.status ?? "pending"),
        })),
      });
      continue;
    }
    if (item.type === "planProposal") {
      entries.push({ kind: "agent", key, text: String(item.plan ?? "") });
      continue;
    }
    if (item.type === "error") {
      entries.push({ kind: "error", key, text: String(item.message ?? item.text ?? "") });
      continue;
    }
    const labelled = toolResultLabel(item);
    entries.push({
      kind: "tool",
      key,
      label: labelled?.label ?? toolFallbackLabel(item),
      detail: labelled?.detail || toolDetail(item),
      running: item.status === "inProgress",
    });
  }
  return entries;
}

export interface UsageSegment {
  label: string;
  tokens: number;
}

export function usageSegments(usage: AgentTokenUsage | undefined): UsageSegment[] {
  if (!usage) return [];
  return [
    { label: "Input", tokens: usage.inputTokens ?? 0 },
    { label: "Output", tokens: usage.outputTokens ?? 0 },
    { label: "Cache read", tokens: usage.cacheReadTokens ?? 0 },
    { label: "Cache write", tokens: usage.cacheWriteTokens ?? 0 },
  ].filter((segment) => segment.tokens > 0);
}

export interface UsageLimitRow {
  label: string;
  resetLabel: string;
  percent: number;
}

function resetLabel(resetsAt: number | null, now: number): string {
  if (!resetsAt) return "";
  const minutes = Math.max(0, Math.round((resetsAt * 1000 - now) / 60_000));
  if (minutes < 60) return `Resets in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `Resets in ${hours} hr ${rest} min` : `Resets in ${hours} hr`;
}

export function usageLimits(limits: AgentRateLimits | null, now: number = Date.now()): UsageLimitRow[] {
  if (!limits) return [];
  const rows: UsageLimitRow[] = [];
  const push = (label: string, window: AgentRateLimits["primary"]) => {
    if (!window) return;
    rows.push({ label, resetLabel: resetLabel(window.resetsAt, now), percent: Math.round(window.usedPercent) });
  };
  push(limits.limitName ?? "Primary limit", limits.primary);
  push("Secondary limit", limits.secondary);
  return rows;
}

export function splitComposerModelId(
  value: string,
  fallback: NativeAgentProvider,
): { provider: NativeAgentProvider; model: string } {
  const separator = value.indexOf(":");
  if (separator <= 0) return { provider: fallback, model: value };
  const provider = value.slice(0, separator) as NativeAgentProvider;
  const known = ["codex", "claude", "opencode", "cursor"].includes(provider);
  return known ? { provider, model: value.slice(separator + 1) } : { provider: fallback, model: value };
}

export function approvalResult(provider: NativeAgentProvider, approved: boolean): Record<string, string> {
  if (provider === "codex") return { decision: approved ? "approved" : "denied" };
  return { decision: approved ? "approve" : "decline" };
}

export function questionAnswerResult(index: number, answers: string[]): Record<string, unknown> {
  return { answers: { [`q-${index}`]: { answers } } };
}
