// Grouping for the agents thread rail. Plain TypeScript so the flattening the
// virtualizer depends on can be unit-tested without mounting the list.

import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import type { AgentThreadSummary } from "@/lib/agents/types";

export type SidebarThread = AgentThreadSummary & { provider: NativeAgentProvider };

export type GroupKey = "pinned" | "today" | "yesterday" | "last7Days" | "older";

/**
 * The grouped list flattened into one array so a single virtualizer can span
 * headers and rows. Grouping stays visual; scrolling stays O(viewport).
 */
export type FlatItem =
  | { kind: "header"; key: string; group: GroupKey }
  | { kind: "thread"; key: string; thread: SidebarThread };

export function groupOf(thread: SidebarThread, startOfToday: number): GroupKey {
  if (thread.isPinned) return "pinned";
  const updated = thread.updatedAt * 1000;
  if (updated >= startOfToday) return "today";
  if (updated >= startOfToday - 86_400_000) return "yesterday";
  if (updated >= startOfToday - 6 * 86_400_000) return "last7Days";
  return "older";
}

export function flattenThreads(threads: SidebarThread[]): FlatItem[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startOfToday = start.getTime();
  const buckets = new Map<GroupKey, SidebarThread[]>();
  for (const thread of threads) {
    const key = groupOf(thread, startOfToday);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(thread);
    else buckets.set(key, [thread]);
  }
  const order: GroupKey[] = ["pinned", "today", "yesterday", "last7Days", "older"];
  const flat: FlatItem[] = [];
  for (const group of order) {
    const bucket = buckets.get(group);
    if (!bucket?.length) continue;
    flat.push({ kind: "header", key: `header:${group}`, group });
    for (const thread of bucket) {
      flat.push({ kind: "thread", key: `${thread.provider}:${thread.id}`, thread });
    }
  }
  return flat;
}
