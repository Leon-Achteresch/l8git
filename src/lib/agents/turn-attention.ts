import i18n from "i18next";

import { chatStoreFor } from "@/lib/agents/active-chat-store";
import { useAgentProviderStore, type NativeAgentProvider } from "@/lib/agents/provider-store";
import { turnAttentionSink } from "@/lib/agents/turn-attention-sink";
import type { AgentChatState } from "@/lib/agents/chat-store";
import type { AgentOverviewEntry } from "@/lib/agents/overview";
import { loadAgentSessionCatalog } from "@/lib/agents/session-catalog";
import { instanceId as toInstanceId, type InstanceId } from "@/lib/agents/types";

const PROVIDERS: NativeAgentProvider[] = ["codex", "claude", "cursor", "opencode"];

export {
  setTurnAttentionSink,
  type TurnAttentionNotification,
  type TurnAttentionSink,
  type TurnAttentionTarget,
} from "@/lib/agents/turn-attention-sink";

export function activeTurnIds(
  conversations: Record<string, { activeTurnId: string | null }>,
): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(conversations).map(([threadId, conversation]) => [
      threadId,
      conversation.activeTurnId,
    ]),
  );
}

export function finishedThreads(
  previous: Record<string, string | null>,
  next: Record<string, string | null>,
): string[] {
  return Object.keys(previous).filter((threadId) => previous[threadId] && !next[threadId]);
}

export interface FinishedTurn {
  threadId: string;
  turnId: string;
}

export function finishedTurns(
  previous: Record<string, string | null>,
  next: Record<string, string | null>,
): FinishedTurn[] {
  const result: FinishedTurn[] = [];
  for (const threadId of Object.keys(previous)) {
    const turnId = previous[threadId];
    if (turnId && !next[threadId]) result.push({ threadId, turnId });
  }
  return result;
}

export function dedupeFinishedTurns(
  seen: Set<string>,
  turns: FinishedTurn[],
  provider = "",
): FinishedTurn[] {
  const fresh: FinishedTurn[] = [];
  for (const turn of turns) {
    const key = `${provider}|${turn.threadId}|${turn.turnId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(turn);
  }
  return fresh;
}

function threadPath(state: AgentChatState, threadId: string): string | null {
  for (const [path, threads] of Object.entries(state.threadsByPath)) {
    if (threads.some((thread) => thread.id === threadId)) return path;
  }
  return null;
}

function notifyFinished(provider: NativeAgentProvider, threadId: string, instanceId?: InstanceId): void {
  const state = chatStoreFor(provider).getState();
  const sink = turnAttentionSink();
  if (!sink.isFocused()) {
    sink.requestAttention();
    return;
  }
  const activeProvider = useAgentProviderStore.getState().provider;
  if (activeProvider === provider && state.visibleThreadId === threadId) return;
  const title = state.conversations[threadId]?.title?.trim();
  const path = threadPath(state, threadId);
  sink.notify({
    title: title || i18n.t("agentChat.turnFinished"),
    target: path ? { provider, path, threadId, instanceId } : undefined,
    action: path
      ? {
          label: i18n.t("agentChat.openThread"),
          run: () => {
            useAgentProviderStore.getState().setProvider(provider);
            void chatStoreFor(provider).getState().openThread(path, threadId).catch(() => {});
          },
        }
      : undefined,
  });
}

export function pendingApprovals(overview: AgentOverviewEntry[]): AgentOverviewEntry[] {
  return overview
    .filter((entry) => entry.status === "awaitingApproval")
    .sort((a, b) => a.updatedAt - b.updatedAt || a.key.localeCompare(b.key));
}

export function nextAttentionTarget(
  current: string | null,
  list: AgentOverviewEntry[],
): AgentOverviewEntry | null {
  if (list.length === 0) return null;
  if (!current) return list[0];
  const index = list.findIndex((entry) => entry.key === current);
  if (index === -1) return list[0];
  return list[(index + 1) % list.length];
}

export function armTurnAttention(): () => void {
  const seenTurns = new Set<string>();
  const unsubscribes = PROVIDERS.map((provider) => {
    const store = chatStoreFor(provider);
    return store.subscribe((state, previous) => {
      if (state.conversations === previous.conversations) return;
      const previousTurns = activeTurnIds(previous.conversations);
      const nextTurns = activeTurnIds(state.conversations);
      const finished = dedupeFinishedTurns(seenTurns, finishedTurns(previousTurns, nextTurns), provider);
      const instanceByThreadId = loadAgentSessionCatalog().instanceByThreadId ?? {};
      for (const turn of finished) {
        const rawInstanceId = instanceByThreadId[turn.threadId];
        notifyFinished(provider, turn.threadId, rawInstanceId ? toInstanceId(rawInstanceId) : undefined);
      }
    });
  });
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
