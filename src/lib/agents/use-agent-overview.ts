import { useMemo } from "react";

import { useProviderChatStore } from "@/lib/agents/active-chat-store";
import { useAgentRepoPaths } from "@/lib/agents/agent-repo-store";
import { useAgentWorktreeStore } from "@/lib/agents/agent-worktrees";
import {
  buildProviderEntries,
  knownPathEntries,
  countPendingRequests,
  countRunningTurns,
  overviewCounts,
  sortOverviewEntries,
  type AgentOverviewCounts,
  type AgentOverviewEntry,
  type ThreadCost,
} from "@/lib/agents/overview";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import { useUsageLedgerStore } from "@/lib/agents/usage-ledger";

function useThreadCosts(): Record<string, ThreadCost> {
  const threads = useUsageLedgerStore((state) => state.threads);
  return useMemo(
    () =>
      Object.fromEntries(
        Object.entries(threads).map(([key, bucket]) => [
          key,
          { costUsd: bucket.costUsd, tokens: bucket.inputTokens + bucket.outputTokens },
        ]),
      ),
    [threads],
  );
}

function useProviderEntries(
  provider: NativeAgentProvider,
  ledger: Record<string, ThreadCost>,
): AgentOverviewEntry[] {
  const threadsByPath = useProviderChatStore(provider, (state) => state.threadsByPath);
  const conversations = useProviderChatStore(provider, (state) => state.conversations);
  const requestsByThread = useProviderChatStore(provider, (state) => state.requestsByThread);
  const worktrees = useAgentWorktreeStore((state) => state.worktrees);
  return useMemo(
    () =>
      buildProviderEntries(
        provider,
        { threadsByPath, conversations, requestsByThread },
        worktrees,
        ledger,
      ),
    [conversations, ledger, provider, requestsByThread, threadsByPath, worktrees],
  );
}

export function useAgentOverviewEntries(): AgentOverviewEntry[] {
  const ledger = useThreadCosts();
  const paths = useAgentRepoPaths();
  const codex = useProviderEntries("codex", ledger);
  const claude = useProviderEntries("claude", ledger);
  const cursor = useProviderEntries("cursor", ledger);
  const opencode = useProviderEntries("opencode", ledger);
  return useMemo(
    () =>
      sortOverviewEntries(
        knownPathEntries([...codex, ...claude, ...cursor, ...opencode], paths),
      ),
    [claude, codex, cursor, opencode, paths],
  );
}

export function useAgentOverviewCounts(entries: AgentOverviewEntry[]): AgentOverviewCounts {
  return useMemo(() => overviewCounts(entries), [entries]);
}

function useProviderActivity(provider: NativeAgentProvider): number {
  const running = useProviderChatStore(provider, (state) => countRunningTurns(state.conversations));
  const pending = useProviderChatStore(provider, (state) =>
    countPendingRequests(state.requestsByThread),
  );
  return running + pending;
}

export function useActiveAgentCount(): number {
  const codex = useProviderActivity("codex");
  const claude = useProviderActivity("claude");
  const cursor = useProviderActivity("cursor");
  const opencode = useProviderActivity("opencode");
  return codex + claude + cursor + opencode;
}

export function useAwaitingApprovalCount(): number {
  const codex = useProviderChatStore("codex", (state) => countPendingRequests(state.requestsByThread));
  const claude = useProviderChatStore("claude", (state) => countPendingRequests(state.requestsByThread));
  const cursor = useProviderChatStore("cursor", (state) => countPendingRequests(state.requestsByThread));
  const opencode = useProviderChatStore("opencode", (state) =>
    countPendingRequests(state.requestsByThread),
  );
  return codex + claude + cursor + opencode;
}
