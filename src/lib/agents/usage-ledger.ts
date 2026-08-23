import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { platformStorage } from "@/lib/platform/kv";

import { chatStoreFor } from "@/lib/agents/active-chat-store";
import { threadCostKey } from "@/lib/agents/overview";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import { estimateCost } from "@/lib/agents/token-cost";
import type { AgentTokenUsage } from "@/lib/agents/types";

const PROVIDERS: NativeAgentProvider[] = ["codex", "claude", "cursor", "opencode"];
const KEEP_DAYS = 30;
const KEEP_THREADS = 400;

export interface UsageBucket {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export type UsageDay = Partial<Record<NativeAgentProvider, UsageBucket>>;

export interface ThreadUsage extends UsageBucket {
  updatedAt: number;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function dayKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function usageTotals(usage: AgentTokenUsage | undefined): UsageTotals {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    cacheReadTokens: usage?.cacheReadTokens ?? 0,
    cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
  };
}

export function usageDelta(previous: UsageTotals | undefined, next: UsageTotals): UsageTotals | null {
  if (!previous) return null;
  const delta: UsageTotals = {
    inputTokens: Math.max(0, next.inputTokens - previous.inputTokens),
    outputTokens: Math.max(0, next.outputTokens - previous.outputTokens),
    cacheReadTokens: Math.max(0, next.cacheReadTokens - previous.cacheReadTokens),
    cacheWriteTokens: Math.max(0, next.cacheWriteTokens - previous.cacheWriteTokens),
  };
  return delta.inputTokens || delta.outputTokens || delta.cacheReadTokens || delta.cacheWriteTokens
    ? delta
    : null;
}

export function addToBucket(bucket: UsageBucket | undefined, delta: UsageTotals, costUsd: number): UsageBucket {
  return {
    inputTokens: (bucket?.inputTokens ?? 0) + delta.inputTokens,
    outputTokens: (bucket?.outputTokens ?? 0) + delta.outputTokens,
    cacheReadTokens: (bucket?.cacheReadTokens ?? 0) + delta.cacheReadTokens,
    cacheWriteTokens: (bucket?.cacheWriteTokens ?? 0) + delta.cacheWriteTokens,
    costUsd: (bucket?.costUsd ?? 0) + costUsd,
  };
}

export function pruneDays(days: Record<string, UsageDay>, today: string, keep: number = KEEP_DAYS): Record<string, UsageDay> {
  const keys = Object.keys(days).filter((key) => key <= today).sort().slice(-keep);
  const recent = new Set(keys);
  return Object.fromEntries(Object.entries(days).filter(([key]) => recent.has(key)));
}

export function pruneThreads(
  threads: Record<string, ThreadUsage>,
  keep: number = KEEP_THREADS,
): Record<string, ThreadUsage> {
  const entries = Object.entries(threads);
  if (entries.length <= keep) return threads;
  return Object.fromEntries(
    entries.sort(([, left], [, right]) => right.updatedAt - left.updatedAt).slice(0, keep),
  );
}

export function sumDays(days: Record<string, UsageDay>, keys: string[]): UsageBucket {
  let total: UsageBucket = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0,
  };
  for (const key of keys) {
    for (const bucket of Object.values(days[key] ?? {})) {
      if (!bucket) continue;
      total = addToBucket(total, bucket, bucket.costUsd);
    }
  }
  return total;
}

export function lastDayKeys(count: number, today: Date = new Date()): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - index);
    return dayKey(date);
  });
}

interface UsageLedgerState {
  days: Record<string, UsageDay>;
  threads: Record<string, ThreadUsage>;
  record: (
    provider: NativeAgentProvider,
    model: string | null,
    delta: UsageTotals,
    threadKey?: string,
  ) => void;
}

export const useUsageLedgerStore = create<UsageLedgerState>()(
  persist(
    (set) => ({
      days: {},
      threads: {},
      record: (provider, model, delta, threadKey) => {
        const cost = estimateCost(
          {
            totalTokens: delta.inputTokens + delta.outputTokens,
            modelContextWindow: null,
            ...delta,
          },
          model,
        );
        const today = dayKey();
        set((state) => {
          const day = state.days[today] ?? {};
          const days = pruneDays(
            {
              ...state.days,
              [today]: { ...day, [provider]: addToBucket(day[provider], delta, cost?.totalUsd ?? 0) },
            },
            today,
          );
          if (!threadKey) return { days };
          const bucket = addToBucket(state.threads[threadKey], delta, cost?.totalUsd ?? 0);
          return {
            days,
            threads: pruneThreads({
              ...state.threads,
              [threadKey]: { ...bucket, updatedAt: Date.now() },
            }),
          };
        });
      },
    }),
    {
      name: "l8git-agent-usage",
      version: 1,
      storage: createJSONStorage(() => platformStorage),
    },
  ),
);

export function armUsageLedger(): () => void {
  const unsubscribes = PROVIDERS.map((provider) => {
    const store = chatStoreFor(provider);
    const previous = new Map<string, UsageTotals>();
    for (const [threadId, conversation] of Object.entries(store.getState().conversations)) {
      previous.set(threadId, usageTotals(conversation.tokenUsage));
    }
    return store.subscribe((state) => {
      for (const [threadId, conversation] of Object.entries(state.conversations)) {
        const next = usageTotals(conversation.tokenUsage);
        const delta = usageDelta(previous.get(threadId), next);
        previous.set(threadId, next);
        if (delta) {
          useUsageLedgerStore
            .getState()
            .record(provider, conversation.model || null, delta, threadCostKey(provider, threadId));
        }
      }
    });
  });
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
