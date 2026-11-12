import { invoke } from "@/lib/platform/ipc";
import { kvSet } from "@/lib/platform/kv";
import { CLAUDE_SETTINGS_KEY } from "@/lib/agents/storage-keys";
import { createStore } from "zustand/vanilla";
import type { AgentChatState } from "@/lib/agents/chat-store";
import { loadModelCatalog } from "@/lib/agents/model-catalog";

import { stringValue, errorMessage } from "@/lib/agents/chat/values";
import {
  HIDDEN_CLIENT_IDLE_MS,
  type UnknownRecord,
  bookedSubagentUsage,
  clientConnectPromises,
  clientLastUsed,
  clients,
  conversationLastUsed,
  eventSequenceByThread,
  permissionProfiles,
  persistedSettings,
  runtimeState,
  streamEventsByThread,
} from "@/lib/agents/providers/claude/chat/state";
import { closeIdleClients } from "@/lib/agents/providers/claude/chat/runtime";
import { messageQueues, threadSuggestions } from "@/lib/agents/providers/claude/chat/queue";
import { claudeThreadActions } from "@/lib/agents/providers/claude/chat/thread-actions";
import { claudeSessionActions } from "@/lib/agents/providers/claude/chat/session-actions";

export { __claudeClientsForTests } from "@/lib/agents/providers/claude/chat/state";
export {
  TASK_TERMINAL_STATUSES,
  applyToolResult,
  classifyResultErrorCategory,
  editChanges,
  groupWorkflowTasks,
  mapTaskStatus,
  normalizeClaudeEvent,
  toolItem,
} from "@/lib/agents/providers/claude/chat/transcript";
export { applyStreamEvents, claudeCapabilitySnapshot } from "@/lib/agents/providers/claude/chat/runtime";
export { handleClaudeMessage } from "@/lib/agents/providers/claude/chat/messages";
export { finalizeThreadExit, warmClaudeModelCatalog } from "@/lib/agents/providers/claude/chat/connect";
export {
  clearThreadSuggestions,
  compactStatusFromEvent,
  dequeueNextMessage,
  editQueuedMessage,
  extractSuggestionsFromFrame,
  getThreadSuggestions,
  listQueuedMessages,
  planSendMode,
  queueMessage,
  removeQueuedMessage,
  requestThreadCompaction,
  resolveCompactRoute,
  selectSuggestion,
  setThreadSuggestions,
} from "@/lib/agents/providers/claude/chat/queue";
export type {
  CompactStatus,
  CompactionRequestResult,
  QueuedMessage,
  SendMode,
  ThreadSuggestion,
} from "@/lib/agents/providers/claude/chat/queue";

let authPromise: Promise<void> | null = null;
let hiddenIdleTimer: ReturnType<typeof setTimeout> | null = null;

export const claudeChatStore = createStore<AgentChatState>()((set, get) => ({
  connectionStatus: "idle",
  connectionError: null,
  diagnostics: [],
  account: null,
  requiresAuth: false,
  loginStatus: "idle",
  loginError: null,
  rateLimits: null,
  accountUsage: null,
  models: loadModelCatalog("claude"),
  defaultModel: null,
  threadsByPath: {},
  loadingPaths: {},
  sessionStatusByThread: {},
  conversations: {},
  visibleThreadId: null,
  activeThreadByPath: {},
  requestsByThread: {},
  model: persistedSettings.model ?? null,
  reasoningEffort: persistedSettings.reasoningEffort ?? "high",
  serviceTier: null,
  personality: "none",
  collaborationMode: persistedSettings.collaborationMode ?? "default",
  collaborationModes: [
    { name: "Default", mode: "default", model: null, reasoningEffort: null },
    { name: "Plan", mode: "plan", model: null, reasoningEffort: null },
  ],
  permissionProfiles,
  permissionProfilesPath: null,
  permissionProfile: persistedSettings.permissionProfile ?? "default",
  realtimeVoices: null,
  realtimeVoice: null,
  approvalPolicy: (persistedSettings.approvalPolicy ?? "on-request") as AgentChatState["approvalPolicy"],
  sandboxMode: (persistedSettings.sandboxMode ?? "workspace-write") as AgentChatState["sandboxMode"],

  retainSurface: () => {
    runtimeState.surfaceReferences += 1;
    if (runtimeState.surfaceReleaseTimer) clearTimeout(runtimeState.surfaceReleaseTimer);
    runtimeState.surfaceReleaseTimer = null;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      runtimeState.surfaceReferences = Math.max(0, runtimeState.surfaceReferences - 1);
      if (runtimeState.surfaceReferences > 0) return;
      runtimeState.surfaceReleaseTimer = setTimeout(() => {
        runtimeState.surfaceReleaseTimer = null;
        if (runtimeState.surfaceReferences === 0) closeIdleClients();
      }, 1_000);
    };
  },
  setVisibleThread: (visibleThreadId) => {
    if (visibleThreadId) conversationLastUsed.set(visibleThreadId, Date.now());
    set({ visibleThreadId });
    if (hiddenIdleTimer) clearTimeout(hiddenIdleTimer);
    hiddenIdleTimer = setTimeout(() => {
      hiddenIdleTimer = null;
      closeIdleClients(true);
    }, HIDDEN_CLIENT_IDLE_MS);
  },
  connect: async () => {
    if (get().connectionStatus === "ready") return;
    if (authPromise) return authPromise;
    const promise = (async () => {
      set({ connectionStatus: "connecting", connectionError: null });
      try {
        const status = await invoke<UnknownRecord>("claude_auth_status");
        const loggedIn = status.loggedIn === true;
        set({
          connectionStatus: "ready",
          requiresAuth: !loggedIn,
          loginStatus: loggedIn ? "idle" : get().loginStatus,
          account: loggedIn ? {
            type: stringValue(status.authMethod, "claude.ai"),
            email: stringValue(status.email) || null,
            planType: stringValue(status.subscriptionType) || null,
          } : null,
        });
      } catch (error) {
        set({ connectionStatus: "error", connectionError: errorMessage(error) });
        throw error;
      }
    })();
    authPromise = promise;
    try {
      await promise;
    } finally {
      if (authPromise === promise) authPromise = null;
    }
  },
  refreshAccount: async () => {
    set({ connectionStatus: "idle" });
    await get().connect();
  },
  startLogin: async () => {
    set({ loginStatus: "starting", loginError: null });
    try {
      const url = await invoke<string>("claude_start_login");
      set({ loginStatus: "waiting" });
      return url;
    } catch (error) {
      set({ loginStatus: "error", loginError: errorMessage(error) });
      throw error;
    }
  },
  logout: async () => {
    await invoke("claude_logout");
    for (const client of clients.values()) await client.close().catch(() => {});
    clients.clear();
    clientLastUsed.clear();
    clientConnectPromises.clear();
    conversationLastUsed.clear();
    streamEventsByThread.clear();
    if (runtimeState.streamFlushTimer) clearTimeout(runtimeState.streamFlushTimer);
    runtimeState.streamFlushTimer = null;
    messageQueues.clear();
    threadSuggestions.clear();
    eventSequenceByThread.clear();
    bookedSubagentUsage.clear();
    set({ account: null, requiresAuth: true });
  },
  ...claudeThreadActions(set, get),
  ...claudeSessionActions(set, get),
}));

let lastPersistedSettings = "";
claudeChatStore.subscribe((state) => {
  const value = JSON.stringify({
    model: state.model,
    reasoningEffort: state.reasoningEffort,
    collaborationMode: state.collaborationMode,
    permissionProfile: state.permissionProfile,
    approvalPolicy: state.approvalPolicy,
    sandboxMode: state.sandboxMode,
  });
  if (value === lastPersistedSettings) return;
  lastPersistedSettings = value;
  kvSet(CLAUDE_SETTINGS_KEY, value);
});
