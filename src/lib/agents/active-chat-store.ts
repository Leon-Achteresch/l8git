import { useStore } from "zustand";

import { useAgentChatStore as useCodexChatStore, type AgentChatState } from "@/lib/agents/chat-store";
import { claudeChatStore } from "@/lib/agents/providers/claude/chat-store";
import { activeAgentProvider, useAgentProviderStore } from "@/lib/agents/provider-store";

function activeStore() {
  return activeAgentProvider() === "claude" ? claudeChatStore : useCodexChatStore;
}

function useActiveChatStore<T>(selector: (state: AgentChatState) => T): T {
  const provider = useAgentProviderStore((state) => state.provider);
  return useStore(provider === "claude" ? claudeChatStore : useCodexChatStore, selector);
}

export const useAgentChatStore = Object.assign(useActiveChatStore, {
  getState: (): AgentChatState => activeStore().getState(),
});
