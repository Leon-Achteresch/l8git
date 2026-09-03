import type {
  AgentConversation,
  AgentItem,
  AgentThreadSummary,
  AgentTurn,
} from "@/lib/agents/types";

export type ThreadDiff = {
  additions: number;
  deletions: number;
};

const EMPTY: ThreadDiff = { additions: 0, deletions: 0 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function countUnifiedDiff(diff: string): ThreadDiff {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("@@")
    ) {
      continue;
    }
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

function countStructuredPatch(patch: unknown[]): ThreadDiff {
  let additions = 0;
  let deletions = 0;
  for (const hunk of patch) {
    if (!isRecord(hunk) || !Array.isArray(hunk.lines)) continue;
    for (const line of hunk.lines) {
      if (typeof line !== "string") continue;
      if (line.startsWith("+")) additions += 1;
      else if (line.startsWith("-")) deletions += 1;
    }
  }
  return { additions, deletions };
}

export function diffFromItem(item: AgentItem): ThreadDiff {
  if (typeof item.linesAdded === "number" || typeof item.linesRemoved === "number") {
    return {
      additions: typeof item.linesAdded === "number" ? item.linesAdded : 0,
      deletions: typeof item.linesRemoved === "number" ? item.linesRemoved : 0,
    };
  }
  if (Array.isArray(item.structuredPatch)) {
    return countStructuredPatch(item.structuredPatch);
  }
  if (item.type !== "fileChange") return EMPTY;
  const changes = Array.isArray(item.changes) ? item.changes : [];
  let additions = 0;
  let deletions = 0;
  for (const change of changes) {
    if (!isRecord(change)) continue;
    if (typeof change.additions === "number" || typeof change.deletions === "number") {
      additions += typeof change.additions === "number" ? change.additions : 0;
      deletions += typeof change.deletions === "number" ? change.deletions : 0;
      continue;
    }
    if (Array.isArray(change.structuredPatch)) {
      const counted = countStructuredPatch(change.structuredPatch);
      additions += counted.additions;
      deletions += counted.deletions;
      continue;
    }
    if (typeof change.diff !== "string" || !change.diff) continue;
    const counted = countUnifiedDiff(change.diff);
    additions += counted.additions;
    deletions += counted.deletions;
  }
  return { additions, deletions };
}

export function diffFromTurns(turns: Pick<AgentTurn, "items">[]): ThreadDiff {
  let additions = 0;
  let deletions = 0;
  for (const turn of turns) {
    for (const item of turn.items) {
      const next = diffFromItem(item);
      additions += next.additions;
      deletions += next.deletions;
    }
  }
  return { additions, deletions };
}

export function diffFromConversation(
  conversation: AgentConversation | null | undefined,
): ThreadDiff | null {
  if (!conversation) return null;
  const diff = diffFromTurns(conversation.turns);
  if (!diff.additions && !diff.deletions) return null;
  return diff;
}

export function keepThreadDiff(
  next: AgentThreadSummary,
  prev: AgentThreadSummary | undefined,
): AgentThreadSummary {
  if ((next.additions ?? 0) > 0 || (next.deletions ?? 0) > 0) return next;
  if (!prev?.additions && !prev?.deletions) return next;
  return { ...next, additions: prev.additions, deletions: prev.deletions };
}

export function stampThreadDiff(
  thread: AgentThreadSummary,
  conversation: AgentConversation | null | undefined,
): AgentThreadSummary {
  const diff = diffFromConversation(conversation);
  if (!diff) return thread;
  if (thread.additions === diff.additions && thread.deletions === diff.deletions) {
    return thread;
  }
  return { ...thread, additions: diff.additions, deletions: diff.deletions };
}

export function conversationDiffPatch(
  threadsByPath: Record<string, AgentThreadSummary[]>,
  conversation: AgentConversation,
): Record<string, AgentThreadSummary[]> | undefined {
  const threads = threadsByPath[conversation.path];
  if (!threads) return undefined;
  let changed = false;
  const next = threads.map((thread) => {
    if (thread.id !== conversation.threadId) return thread;
    const stamped = stampThreadDiff(thread, conversation);
    if (stamped !== thread) changed = true;
    return stamped;
  });
  return changed ? { ...threadsByPath, [conversation.path]: next } : undefined;
}
