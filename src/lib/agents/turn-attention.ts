import i18n from "i18next";

import { chatStoreFor } from "@/lib/agents/active-chat-store";
import { useAgentProviderStore, type NativeAgentProvider } from "@/lib/agents/provider-store";
import { turnAttentionSink } from "@/lib/agents/turn-attention-sink";
import type { AgentChatState } from "@/lib/agents/chat-store";

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

function threadPath(state: AgentChatState, threadId: string): string | null {
  for (const [path, threads] of Object.entries(state.threadsByPath)) {
    if (threads.some((thread) => thread.id === threadId)) return path;
  }
  return null;
}

function notifyFinished(provider: NativeAgentProvider, threadId: string): void {
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
    target: path ? { provider, path, threadId } : undefined,
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

export function armTurnAttention(): () => void {
  const unsubscribes = PROVIDERS.map((provider) => {
    const store = chatStoreFor(provider);
    let previous = activeTurnIds(store.getState().conversations);
    return store.subscribe((state) => {
      const next = activeTurnIds(state.conversations);
      const finished = finishedThreads(previous, next);
      previous = next;
      for (const threadId of finished) notifyFinished(provider, threadId);
    });
  });
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
