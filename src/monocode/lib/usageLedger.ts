import { useSyncExternalStore } from "react";
import { addUsage, estimateCost, type TokenUsage } from "./tokenCost";

export type UsageEntry = TokenUsage & {
  sessionId: string;
  harness: string;
  model: string;
  title?: string;
  day: string;
  updatedAt: number;
};

const KEY = "monocode.usageLedger";
const KEEP_DAYS = 90;
const listeners = new Set<() => void>();
let cache: Record<string, UsageEntry> | null = null;

function dayKey(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function load(): Record<string, UsageEntry> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Record<string, UsageEntry>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function save(next: Record<string, UsageEntry>) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // quota
  }
  for (const fn of listeners) fn();
}

export function recordUsage(
  meta: { sessionId: string; harness: string; model: string; title?: string },
  delta: Partial<TokenUsage>,
) {
  if (!delta.input && !delta.output && !delta.cacheRead && !delta.cacheWrite) return;
  const all = load();
  const prev = all[meta.sessionId];
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  const next: Record<string, UsageEntry> = {};
  for (const [id, entry] of Object.entries(all)) {
    if (entry.updatedAt >= cutoff) next[id] = entry;
  }
  next[meta.sessionId] = {
    ...addUsage(prev, delta),
    sessionId: meta.sessionId,
    harness: meta.harness,
    model: meta.model,
    title: meta.title ?? prev?.title,
    day: prev?.day ?? dayKey(),
    updatedAt: Date.now(),
  };
  save(next);
}

export function sessionUsage(sessionId: string): UsageEntry | undefined {
  return load()[sessionId];
}

export function allUsage(): UsageEntry[] {
  return Object.values(load()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function entryCost(entry: UsageEntry): number {
  return estimateCost(entry, entry.model)?.totalUsd ?? 0;
}

export function sumCost(entries: UsageEntry[], sinceDays?: number): number {
  const cutoff = sinceDays ? Date.now() - sinceDays * 86_400_000 : 0;
  return entries
    .filter((e) => e.updatedAt >= cutoff)
    .reduce((sum, e) => sum + entryCost(e), 0);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSessionUsage(sessionId: string | undefined): UsageEntry | undefined {
  return useSyncExternalStore(subscribe, () =>
    sessionId ? load()[sessionId] : undefined,
  );
}

export function useUsageLedger(): Record<string, UsageEntry> {
  return useSyncExternalStore(subscribe, load);
}
