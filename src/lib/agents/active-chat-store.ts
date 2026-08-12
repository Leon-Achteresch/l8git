import { useStore } from "zustand";

import { useAgentChatStore as useCodexChatStore, type AgentChatState } from "@/lib/agents/chat-store";
import { claudeChatStore } from "@/lib/agents/providers/claude/chat-store";
import { cursorChatStore } from "@/lib/agents/providers/cursor/chat-store";
import { openCodeChatStore } from "@/lib/agents/providers/opencode/chat-store";
import {
  activeAgentProvider,
  useAgentProviderStore,
  type NativeAgentProvider,
} from "@/lib/agents/provider-store";

export function chatStoreFor(provider: NativeAgentProvider) {
  if (provider === "claude") return claudeChatStore;
  if (provider === "opencode") return openCodeChatStore;
  if (provider === "cursor") return cursorChatStore;
  return useCodexChatStore;
}

function activeStore() {
  return chatStoreFor(activeAgentProvider());
}

function useActiveChatStore<T>(selector: (state: AgentChatState) => T): T {
  const provider = useAgentProviderStore((state) => state.provider);
  return useStore(chatStoreFor(provider), selector);
}

export function useProviderChatStore<T>(
  provider: NativeAgentProvider,
  selector: (state: AgentChatState) => T,
): T {
  return useStore(chatStoreFor(provider), selector);
}

export const useAgentChatStore = Object.assign(useActiveChatStore, {
  getState: (): AgentChatState => activeStore().getState(),
});
