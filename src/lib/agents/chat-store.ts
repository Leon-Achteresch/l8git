import { create } from "zustand";
import type {
  AgentAccount,
  AgentAccountUsage,
  AgentApprovalPolicy,
  AgentApp,
  AgentAttachment,
  AgentBackgroundTerminal,
  AgentCollaborationMode,
  AgentCollaborationModeOption,
  AgentConnectionStatus,
  AgentConversation,
  AgentExternalConfigImportHistory,
  AgentExternalConfigImportTypeResult,
  AgentExternalConfigMigrationItem,
  AgentFileMatch,
  AgentHook,
  AgentModelOption,
  AgentMcpServer,
  AgentPendingRequest,
  AgentPermissionProfile,
  AgentPersonality,
  AgentPlugin,
  AgentRateLimits,
  AgentReasoningEffort,
  AgentRealtimeVoice,
  AgentRealtimeVoices,
  AgentSandboxMode,
  AgentSkill,
  AgentThreadSummary,
} from "@/lib/agents/types";
import { codexSessionManager } from "@/lib/agents/session-manager";
import {
  flushAgentSessionCatalog,
  scheduleAgentSessionCatalogSave,
  type AgentSessionCatalog,
} from "@/lib/agents/session-catalog";
import { loadModelCatalog, saveModelCatalog } from "@/lib/agents/model-catalog";
import { onAppSuspend } from "@/lib/platform/lifecycle";

import { errorMessage } from "@/lib/agents/chat/values";
import { normalizeAccountUsage, normalizeRateLimits } from "@/lib/agents/chat/codex-normalize";
import { attachListeners } from "@/lib/agents/chat/codex-events";
import { persistedCatalog } from "@/lib/agents/chat/codex-state";
import { codexThreadActions } from "@/lib/agents/chat/codex-thread-actions";
import { codexTurnActions } from "@/lib/agents/chat/codex-turn-actions";
import { codexCapabilityActions } from "@/lib/agents/chat/codex-capability-actions";

export interface AgentChatState {
  connectionStatus: AgentConnectionStatus;
  connectionError: string | null;
  diagnostics: string[];
  account: AgentAccount | null;
  requiresAuth: boolean;
  loginStatus: "idle" | "starting" | "waiting" | "error";
  loginError: string | null;
  rateLimits: AgentRateLimits | null;
  accountUsage: AgentAccountUsage | null;
  models: AgentModelOption[];
  defaultModel: string | null;
  threadsByPath: Record<string, AgentThreadSummary[]>;
  loadingPaths: Record<string, boolean>;
  sessionStatusByThread: Record<string, AgentConnectionStatus>;
  conversations: Record<string, AgentConversation>;
  visibleThreadId: string | null;
  activeThreadByPath: Record<string, string | null>;
  requestsByThread: Record<string, AgentPendingRequest[]>;
  model: string | null;
  reasoningEffort: AgentReasoningEffort;
  serviceTier: string | null;
  personality: AgentPersonality;
  collaborationMode: AgentCollaborationMode;
  collaborationModes: AgentCollaborationModeOption[];
  permissionProfiles: AgentPermissionProfile[];
  permissionProfilesPath: string | null;
  permissionProfile: string | null;
  realtimeVoices: AgentRealtimeVoices | null;
  realtimeVoice: AgentRealtimeVoice | null;
  approvalPolicy: AgentApprovalPolicy;
  sandboxMode: AgentSandboxMode;
  retainSurface: () => () => void;
  setVisibleThread: (threadId: string | null) => void;
  connect: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  startLogin: () => Promise<string>;
  logout: () => Promise<void>;
  loadThreads: (paths: string[]) => Promise<void>;
  createThread: (path: string) => Promise<string>;
  openThread: (path: string, threadId: string) => Promise<void>;
  sendMessage: (path: string, text: string, attachments?: AgentAttachment[]) => Promise<void>;
  steerMessage: (threadId: string, text: string, attachments?: AgentAttachment[]) => Promise<void>;
  interrupt: (threadId: string) => Promise<void>;
  respondToRequest: (request: AgentPendingRequest, result: unknown) => Promise<void>;
  rejectUnsupportedRequest: (request: AgentPendingRequest) => Promise<void>;
  archiveThread: (path: string, threadId: string) => Promise<void>;
  unarchiveThread: (path: string, threadId: string) => Promise<void>;
  deleteThread: (path: string, threadId: string) => Promise<void>;
  renameThread: (path: string, threadId: string, name: string) => Promise<void>;
  setThreadPinned: (path: string, threadId: string, isPinned: boolean) => Promise<void>;
  startReview: (threadId: string, instructions?: string) => Promise<void>;
  compactThread: (threadId: string) => Promise<void>;
  forkThread: (path: string, threadId: string) => Promise<string>;
  listSkills: (path: string, forceReload?: boolean) => Promise<AgentSkill[]>;
  loadPermissionProfiles: (path: string) => Promise<void>;
  listApps: (threadId?: string) => Promise<AgentApp[]>;
  listMcpServers: (threadId?: string) => Promise<AgentMcpServer[]>;
  loginMcpServer: (name: string, threadId?: string) => Promise<string>;
  searchFiles: (path: string, query: string) => Promise<AgentFileMatch[]>;
  listHooks: (path: string) => Promise<AgentHook[]>;
  listPlugins: (path: string) => Promise<AgentPlugin[]>;
  detectExternalAgentConfig: (path: string) => Promise<AgentExternalConfigMigrationItem[]>;
  listExternalAgentConfigImportHistories: () => Promise<AgentExternalConfigImportHistory[]>;
  importExternalAgentConfig: (
    items: AgentExternalConfigMigrationItem[],
    onProgress?: (results: AgentExternalConfigImportTypeResult[]) => void,
  ) => Promise<AgentExternalConfigImportTypeResult[]>;
  sendFeedback: (reason: string, threadId?: string, includeLogs?: boolean) => Promise<string>;
  listBackgroundTerminals: (threadId: string) => Promise<AgentBackgroundTerminal[]>;
  stopBackgroundTerminals: (threadId: string) => Promise<void>;
  terminateBackgroundTerminal: (threadId: string, processId: string) => Promise<boolean>;
  setGoal: (threadId: string, objective: string) => Promise<void>;
  clearGoal: (threadId: string) => Promise<void>;
  setMemoryMode: (threadId: string, mode: "enabled" | "disabled") => Promise<void>;
  resetMemory: () => Promise<void>;
  setModel: (model: string) => void;
  setReasoningEffort: (effort: AgentReasoningEffort) => void;
  setServiceTier: (tier: string | null) => void;
  setPersonality: (personality: AgentPersonality) => void;
  setCollaborationMode: (mode: AgentCollaborationMode) => void;
  setPermissionProfile: (profile: string | null) => void;
  setRealtimeVoice: (voice: AgentRealtimeVoice) => void;
  setApprovalPolicy: (policy: AgentApprovalPolicy) => void;
  setSandboxMode: (mode: AgentSandboxMode) => void;
  clearError: (threadId?: string) => void;
}

let connectPromise: Promise<void> | null = null;

export const useAgentChatStore = create<AgentChatState>()(
    (set, get) => ({
      connectionStatus: "idle",
      connectionError: null,
      diagnostics: [],
      account: null,
      requiresAuth: false,
      loginStatus: "idle",
      loginError: null,
      rateLimits: null,
      accountUsage: null,
      models: loadModelCatalog("codex"),
      defaultModel: null,
      threadsByPath: persistedCatalog.threadsByPath ?? {},
      loadingPaths: {},
      sessionStatusByThread: {},
      conversations: {},
      visibleThreadId: null,
      activeThreadByPath: persistedCatalog.activeThreadByPath ?? {},
      requestsByThread: {},
      model: persistedCatalog.model ?? null,
      reasoningEffort: persistedCatalog.reasoningEffort ?? "medium",
      serviceTier: persistedCatalog.serviceTier ?? null,
      personality: persistedCatalog.personality ?? "friendly",
      collaborationMode: persistedCatalog.collaborationMode ?? "default",
      collaborationModes: [],
      permissionProfiles: [],
      permissionProfilesPath: null,
      permissionProfile: persistedCatalog.permissionProfile ?? null,
      realtimeVoices: null,
      realtimeVoice: persistedCatalog.realtimeVoice ?? null,
      approvalPolicy: persistedCatalog.approvalPolicy ?? "on-request",
      sandboxMode: persistedCatalog.sandboxMode ?? "workspace-write",

      retainSurface: () => {
        attachListeners();
        return codexSessionManager.retainSurface();
      },

      setVisibleThread: (threadId) => {
        codexSessionManager.setVisibleThread(threadId);
        set({ visibleThreadId: threadId });
      },

      connect: async () => {
        if (get().connectionStatus === "ready") return;
        if (connectPromise) return connectPromise;
        attachListeners();
        set({ connectionStatus: "connecting", connectionError: null });
        connectPromise = (async () => {
          let controlRetained = false;
          try {
            const client = await codexSessionManager.controlClient();
            controlRetained = true;
            const [modelsResponse, accountResponse, rateResponse, usageResponse, modesResponse] = await Promise.all([
              client.models(),
              client.account(),
              client.rateLimits().catch(() => null),
              client.usage().catch(() => null),
              client.collaborationModes().catch(() => ({ data: [] })),
            ]);
            const models: AgentModelOption[] = modelsResponse.map((model) => ({
              id: model.model,
              label: model.displayName,
              description: model.description,
              isDefault: model.isDefault,
              inputModalities: model.inputModalities,
              reasoningEfforts: model.supportedReasoningEfforts.map((option) => ({
                value: option.reasoningEffort,
                label: option.reasoningEffort,
                description: option.description,
              })),
              defaultReasoningEffort: model.defaultReasoningEffort,
              serviceTiers: model.serviceTiers ?? [],
              defaultServiceTier: model.defaultServiceTier ?? null,
              supportsPersonality: model.supportsPersonality === true,
            }));
            saveModelCatalog("codex", models);
            const defaultModel =
              models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
            const currentModel = get().model;
            const selectedModelId =
              currentModel && models.some((model) => model.id === currentModel)
                ? currentModel
                : defaultModel;
            const selectedModel = models.find((candidate) => candidate.id === selectedModelId);
            set((state) => ({
              connectionStatus: "ready",
              models,
              defaultModel,
              model: selectedModelId,
              reasoningEffort:
                selectedModel?.reasoningEfforts.some(
                  (option) => option.value === state.reasoningEffort,
                )
                  ? state.reasoningEffort
                  : (selectedModel?.defaultReasoningEffort ?? state.reasoningEffort),
              serviceTier: selectedModel?.serviceTiers.some((tier) => tier.id === state.serviceTier)
                ? state.serviceTier
                : selectedModel?.defaultServiceTier ?? null,
              account: accountResponse.account,
              requiresAuth: accountResponse.requiresOpenaiAuth && !accountResponse.account,
              rateLimits: normalizeRateLimits(rateResponse?.rateLimits),
              accountUsage: normalizeAccountUsage(usageResponse?.summary),
              collaborationModes: modesResponse.data.flatMap((mode) =>
                mode.mode === "default" || mode.mode === "plan"
                  ? [{
                      name: mode.name,
                      mode: mode.mode,
                      model: mode.model,
                      reasoningEffort: mode.reasoning_effort,
                    }]
                  : [],
              ),
            }));
          } catch (error) {
            set({ connectionStatus: "error", connectionError: errorMessage(error) });
            throw error;
          } finally {
            if (controlRetained) codexSessionManager.releaseControl();
            connectPromise = null;
          }
        })();
        return connectPromise;
      },

      refreshAccount: async () => {
        attachListeners();
        const client = await codexSessionManager.controlClient();
        try {
          const accountResponse = await client.account();
          const [rateResponse, usageResponse] = accountResponse.account
            ? await Promise.all([
                client.rateLimits().catch(() => null),
                client.usage().catch(() => null),
              ])
            : [null, null];
          set({
            account: accountResponse.account,
            requiresAuth: accountResponse.requiresOpenaiAuth && !accountResponse.account,
            loginStatus: "idle",
            loginError: null,
            rateLimits: normalizeRateLimits(rateResponse?.rateLimits) ?? (accountResponse.account ? get().rateLimits : null),
            accountUsage: normalizeAccountUsage(usageResponse?.summary) ?? (accountResponse.account ? get().accountUsage : null),
          });
        } finally {
          codexSessionManager.releaseControl();
        }
      },

      startLogin: async () => {
        attachListeners();
        const client = await codexSessionManager.controlClient();
        set({ loginStatus: "starting", loginError: null });
        try {
          const response = await client.loginChatGpt();
          const url = response.type === "chatgpt" && typeof response.authUrl === "string"
            ? response.authUrl
            : response.type === "chatgptDeviceCode" && typeof response.verificationUrl === "string"
              ? response.verificationUrl
              : null;
          if (!url) throw new Error("Codex returned no login URL.");
          set({ loginStatus: "waiting" });
          return url;
        } catch (error) {
          codexSessionManager.releaseControl();
          set({ loginStatus: "error", loginError: errorMessage(error) });
          throw error;
        }
      },

      logout: async () => {
        const client = await codexSessionManager.controlClient();
        await client.logout();
        await codexSessionManager.closeAll();
        set({
          connectionStatus: "idle",
          account: null,
          requiresAuth: true,
          loginStatus: "idle",
          loginError: null,
          rateLimits: null,
          accountUsage: null,
        });
      },
      ...codexThreadActions(set, get),
      ...codexTurnActions(set, get),
      ...codexCapabilityActions(set, get),
    }),
);

function sessionCatalogSnapshot(state: AgentChatState): AgentSessionCatalog {
  return {
    threadsByPath: state.threadsByPath,
    activeThreadByPath: state.activeThreadByPath,
    model: state.model,
    reasoningEffort: state.reasoningEffort,
    serviceTier: state.serviceTier,
    personality: state.personality,
    collaborationMode: state.collaborationMode,
    permissionProfile: state.permissionProfile,
    realtimeVoice: state.realtimeVoice,
    approvalPolicy: state.approvalPolicy,
    sandboxMode: state.sandboxMode,
  };
}

let previousCatalog = sessionCatalogSnapshot(useAgentChatStore.getState());
useAgentChatStore.subscribe((state) => {
  const nextCatalog = sessionCatalogSnapshot(state);
  if (
    nextCatalog.threadsByPath === previousCatalog.threadsByPath &&
    nextCatalog.activeThreadByPath === previousCatalog.activeThreadByPath &&
    nextCatalog.model === previousCatalog.model &&
    nextCatalog.reasoningEffort === previousCatalog.reasoningEffort &&
    nextCatalog.serviceTier === previousCatalog.serviceTier &&
    nextCatalog.personality === previousCatalog.personality &&
    nextCatalog.collaborationMode === previousCatalog.collaborationMode &&
    nextCatalog.permissionProfile === previousCatalog.permissionProfile &&
    nextCatalog.realtimeVoice === previousCatalog.realtimeVoice &&
    nextCatalog.approvalPolicy === previousCatalog.approvalPolicy &&
    nextCatalog.sandboxMode === previousCatalog.sandboxMode
  ) {
    return;
  }
  previousCatalog = nextCatalog;
  scheduleAgentSessionCatalogSave(nextCatalog);
});

onAppSuspend(flushAgentSessionCatalog);
