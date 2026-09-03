import { create } from "zustand";

import type { RpcNotification, RpcServerRequest } from "@/lib/agents/rpc-client";
import { sandboxPolicyFor } from "@/lib/agents/providers/codex/client";
import {
  codexSandboxMode,
  type CodexThread,
  type CodexThreadRuntime,
  type CodexTurn,
  type CodexUserInput,
} from "@/lib/agents/providers/codex/protocol";
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
  AgentInputQuestion,
  AgentItem,
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
  AgentTurn,
  AgentTurnStatus,
} from "@/lib/agents/types";
import {
  codexSessionManager,
  type CodexSessionContext,
} from "@/lib/agents/session-manager";
import {
  flushAgentSessionCatalog,
  loadAgentSessionCatalog,
  scheduleAgentSessionCatalogSave,
  type AgentSessionCatalog,
} from "@/lib/agents/session-catalog";
import { loadModelCatalog, saveModelCatalog } from "@/lib/agents/model-catalog";
import { conversationDiffPatch, diffFromTurns, keepThreadDiff } from "@/lib/agents/thread-diff";
import { onAppSuspend } from "@/lib/platform/lifecycle";
import i18n from "@/lib/i18n";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingRolloutError(error: unknown): boolean {
  return /no rollout found for thread id/i.test(errorMessage(error));
}

function externalImportNotification(
  event: RpcNotification,
): { importId: string; itemTypeResults: AgentExternalConfigImportTypeResult[] } | null {
  const importId = stringValue(event.params?.importId);
  const itemTypeResults = event.params?.itemTypeResults;
  if (!importId || !Array.isArray(itemTypeResults)) return null;
  return { importId, itemTypeResults: itemTypeResults as AgentExternalConfigImportTypeResult[] };
}

function threadStatus(status: CodexThread["status"]): string {
  if (typeof status === "string") return status;
  return status.type ?? "idle";
}

function threadSummary(thread: CodexThread): AgentThreadSummary {
  const diff = diffFromTurns(Array.isArray(thread.turns) ? thread.turns : []);
  return {
    id: thread.id,
    path: thread.cwd,
    title: thread.name?.trim() || thread.preview.trim() || i18n.t("agentChat.newConversation"),
    preview: thread.preview,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    status: threadStatus(thread.status),
    modelProvider: thread.modelProvider,
    isPinned: thread.isPinned,
    ...(diff.additions || diff.deletions
      ? { additions: diff.additions, deletions: diff.deletions }
      : {}),
  };
}

function sortThreadSummaries(threads: AgentThreadSummary[]): AgentThreadSummary[] {
  return [...threads].sort(
    (a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt,
  );
}

function updateThreadSummary(
  threadsByPath: Record<string, AgentThreadSummary[]>,
  threadId: string,
  update: (thread: AgentThreadSummary) => AgentThreadSummary | null,
): Record<string, AgentThreadSummary[]> {
  for (const [path, threads] of Object.entries(threadsByPath)) {
    const index = threads.findIndex((thread) => thread.id === threadId);
    if (index < 0) continue;
    const nextThread = update(threads[index]);
    const next = [...threads];
    if (nextThread) next[index] = nextThread;
    else next.splice(index, 1);
    return { ...threadsByPath, [path]: nextThread ? sortThreadSummaries(next) : next };
  }
  return threadsByPath;
}

function inputFromAttachment(attachment: AgentAttachment): CodexUserInput {
  if (attachment.type === "localImage") return { type: "localImage", path: attachment.path };
  if (attachment.type === "localAudio") return { type: "localAudio", path: attachment.path };
  return { type: attachment.type, name: attachment.name, path: attachment.path };
}

function normalizeTurn(turn: CodexTurn): AgentTurn {
  return {
    id: turn.id,
    items: Array.isArray(turn.items) ? turn.items : [],
    status: turn.status,
    error: turn.error?.message ?? null,
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
    durationMs: turn.durationMs,
  };
}

function conversationFromRuntime(runtime: CodexThreadRuntime): AgentConversation {
  let activeTurnId: string | null = null;
  for (let index = runtime.thread.turns.length - 1; index >= 0; index -= 1) {
    if (runtime.thread.turns[index].status === "inProgress") {
      activeTurnId = runtime.thread.turns[index].id;
      break;
    }
  }
  return {
    threadId: runtime.thread.id,
    path: runtime.cwd,
    title:
      runtime.thread.name?.trim() ||
      runtime.thread.preview.trim() ||
      i18n.t("agentChat.newConversation"),
    model: runtime.model,
    reasoningEffort: runtime.reasoningEffort,
    approvalPolicy: runtime.approvalPolicy,
    sandboxMode: codexSandboxMode(runtime.sandbox.type),
    turns: runtime.thread.turns.map(normalizeTurn),
    activeTurnId,
    loading: false,
    error: null,
  };
}

function replaceItem(items: AgentItem[], item: AgentItem): AgentItem[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) {
    if (item.type === "userMessage" && typeof item.clientId === "string") {
      const optimistic = items.findIndex(
        (candidate) => candidate.type === "userMessage" && candidate.clientId === item.clientId,
      );
      if (optimistic >= 0) {
        const next = [...items];
        next[optimistic] = item;
        return next;
      }
    }
    return [...items, item];
  }
  const next = [...items];
  next[index] = keepStreamedReasoning(items[index], item);
  return next;
}

function keepStreamedReasoning(current: AgentItem, incoming: AgentItem): AgentItem {
  if (incoming.type !== "reasoning") return incoming;
  const merged = { ...incoming };
  for (const field of ["summary", "content"] as const) {
    const next = Array.isArray(merged[field]) ? merged[field] : [];
    const previous = Array.isArray(current[field]) ? current[field] : [];
    if (next.length === 0 && previous.length > 0) merged[field] = previous;
  }
  return merged;
}

function mergeCompletedTurn(current: AgentTurn | undefined, incoming: CodexTurn): AgentTurn {
  const normalized = normalizeTurn(incoming);
  if (!current) return normalized;
  const items = [...current.items];
  for (const item of normalized.items) {
    const next = replaceItem(items, item);
    items.splice(0, items.length, ...next);
  }
  return { ...current, ...normalized, items };
}

function statusFromUnknown(value: unknown): AgentTurnStatus {
  return value === "completed" || value === "interrupted" || value === "failed"
    ? value
    : "inProgress";
}

function requestFromRpc(
  context: CodexSessionContext,
  request: RpcServerRequest,
): AgentPendingRequest {
  const params = request.params ?? {};
  const method = request.method;
  let kind: AgentPendingRequest["kind"] = "unknown";
  if (method === "item/commandExecution/requestApproval") kind = "command";
  else if (method === "item/fileChange/requestApproval") kind = "file-change";
  else if (method === "execCommandApproval") kind = "command";
  else if (method === "applyPatchApproval") kind = "file-change";
  else if (method === "item/tool/requestUserInput") kind = "user-input";
  else if (method === "item/permissions/requestApproval") kind = "permissions";
  else if (method === "mcpServer/elicitation/request") kind = "elicitation";
  const questions = Array.isArray(params.questions)
    ? params.questions.filter(isRecord).map<AgentInputQuestion>((question, index) => ({
        id: stringValue(question.id, `question-${index}`),
        header: stringValue(question.header),
        question: stringValue(question.question),
        isOther: question.isOther === true,
        isSecret: question.isSecret === true,
        options: Array.isArray(question.options)
          ? question.options.filter(isRecord).map((option) => ({
              label: stringValue(option.label),
              description: stringValue(option.description) || undefined,
            }))
          : [],
      }))
    : undefined;
  return {
    sessionId: context.sessionId,
    requestId: request.id,
    method,
    kind,
    threadId: stringValue(
      params.threadId,
      stringValue(params.conversationId, context.threadId ?? "__global"),
    ),
    turnId: stringValue(params.turnId) || undefined,
    itemId: stringValue(params.itemId, stringValue(params.callId)) || undefined,
    reason: stringValue(params.reason) || undefined,
    command: stringValue(params.command) || (Array.isArray(params.command)
      ? params.command.filter((value): value is string => typeof value === "string").join(" ")
      : undefined),
    cwd: stringValue(params.cwd) || undefined,
    grantRoot: stringValue(params.grantRoot) || undefined,
    questions,
    raw: params,
  };
}

type DeltaUpdate = {
  threadId: string;
  turnId: string;
  itemId: string;
  field: "text" | "aggregatedOutput" | "plan" | "reasoningSummary" | "reasoningContent";
  delta: string;
  partIndex?: number;
};

function normalizeRateLimits(value: unknown): AgentRateLimits | null {
  if (!isRecord(value)) return null;
  const normalizeWindow = (candidate: unknown) => {
    if (!isRecord(candidate) || typeof candidate.usedPercent !== "number") return null;
    return {
      usedPercent: candidate.usedPercent,
      windowDurationMins:
        typeof candidate.windowDurationMins === "number" ? candidate.windowDurationMins : null,
      resetsAt: typeof candidate.resetsAt === "number" ? candidate.resetsAt : null,
    };
  };
  return {
    limitId: typeof value.limitId === "string" ? value.limitId : null,
    limitName: typeof value.limitName === "string" ? value.limitName : null,
    primary: normalizeWindow(value.primary),
    secondary: normalizeWindow(value.secondary),
    planType: typeof value.planType === "string" ? value.planType : null,
  };
}

function normalizeAccountUsage(value: unknown): AgentAccountUsage | null {
  if (!isRecord(value)) return null;
  const numberOrNull = (candidate: unknown): number | null => {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim()) {
      const parsed = Number(candidate);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  return {
    lifetimeTokens: numberOrNull(value.lifetimeTokens),
    peakDailyTokens: numberOrNull(value.peakDailyTokens),
    longestRunningTurnSec: numberOrNull(value.longestRunningTurnSec),
    currentStreakDays: numberOrNull(value.currentStreakDays),
    longestStreakDays: numberOrNull(value.longestStreakDays),
  };
}

let listenersAttached = false;
const DELTA_FLUSH_MS = 100;
let deltaTimer: ReturnType<typeof setTimeout> | null = null;
const deltaQueue: DeltaUpdate[] = [];

function flushScheduledDeltas(): void {
  if (deltaTimer) clearTimeout(deltaTimer);
  deltaTimer = null;
  if (deltaQueue.length === 0) return;
  const grouped = new Map<string, DeltaUpdate>();
  for (const update of deltaQueue.splice(0)) {
    const key = [
      update.threadId,
      update.turnId,
      update.itemId,
      update.field,
      update.partIndex ?? "",
    ].join("\u0000");
    const current = grouped.get(key);
    if (current) current.delta += update.delta;
    else grouped.set(key, { ...update });
  }
  const updates = [...grouped.values()];
  useAgentChatStore.setState((state) => {
    let conversations = state.conversations;
    const touched = new Map<string, AgentConversation>();
    for (const item of updates) {
      const base = touched.get(item.threadId) ?? conversations[item.threadId];
      if (!base) continue;
      const turnIndex = base.turns.findIndex((turn) => turn.id === item.turnId);
      if (turnIndex < 0) continue;
      const turn = base.turns[turnIndex];
      const index = turn.items.findIndex((candidate) => candidate.id === item.itemId);
      const current = index >= 0 ? turn.items[index] : undefined;
      const type =
        item.field === "text"
          ? "agentMessage"
          : item.field === "aggregatedOutput"
            ? "commandExecution"
            : item.field === "plan"
              ? "plan"
              : "reasoning";
      const nextItem: AgentItem = current
        ? { ...current }
        : { id: item.itemId, type };
      if (item.field === "reasoningSummary" || item.field === "reasoningContent") {
        const targetField = item.field === "reasoningSummary" ? "summary" : "content";
        const parts = Array.isArray(nextItem[targetField])
          ? nextItem[targetField].filter((value): value is string => typeof value === "string")
          : [];
        const partIndex = item.partIndex ?? Math.max(0, parts.length - 1);
        while (parts.length <= partIndex) parts.push("");
        parts[partIndex] = `${parts[partIndex]}${item.delta}`;
        nextItem[targetField] = parts;
      } else {
        nextItem[item.field] = `${stringValue(nextItem[item.field])}${item.delta}`;
      }
      const nextItems = [...turn.items];
      if (index >= 0) nextItems[index] = nextItem;
      else nextItems.push(nextItem);
      const turns = [...base.turns];
      turns[turnIndex] = { ...turn, items: nextItems };
      touched.set(item.threadId, { ...base, turns });
    }
    if (touched.size === 0) return state;
    conversations = { ...conversations };
    for (const [threadId, conversation] of touched) conversations[threadId] = conversation;
    return { conversations };
  });
}

function scheduleDelta(update: DeltaUpdate): void {
  deltaQueue.push(update);
  if (deltaTimer) return;
  deltaTimer = setTimeout(flushScheduledDeltas, DELTA_FLUSH_MS);
}

function handleEvent(context: CodexSessionContext, event: RpcNotification): void {
  const params = event.params ?? {};
  if (event.method === "skills/changed") skillsCache.clear();
  if (event.method === "app/list/updated") appsCache.clear();
  const threadId = stringValue(params.threadId);
  const turnId = stringValue(params.turnId);
  if (event.method === "item/agentMessage/delta") {
    scheduleDelta({ threadId, turnId, itemId: stringValue(params.itemId), field: "text", delta: stringValue(params.delta) });
    return;
  }
  if (event.method === "item/commandExecution/outputDelta") {
    scheduleDelta({ threadId, turnId, itemId: stringValue(params.itemId), field: "aggregatedOutput", delta: stringValue(params.delta) });
    return;
  }
  if (event.method === "item/plan/delta") {
    scheduleDelta({ threadId, turnId, itemId: stringValue(params.itemId), field: "plan", delta: stringValue(params.delta) });
    return;
  }
  if (event.method === "item/reasoning/summaryTextDelta") {
    scheduleDelta({
      threadId,
      turnId,
      itemId: stringValue(params.itemId),
      field: "reasoningSummary",
      delta: stringValue(params.delta),
      partIndex: typeof params.summaryIndex === "number" ? params.summaryIndex : undefined,
    });
    return;
  }
  if (event.method === "item/reasoning/textDelta") {
    scheduleDelta({
      threadId,
      turnId,
      itemId: stringValue(params.itemId),
      field: "reasoningContent",
      delta: stringValue(params.delta),
      partIndex: typeof params.contentIndex === "number" ? params.contentIndex : undefined,
    });
    return;
  }
  // Apply queued partial text before a canonical item/turn frame replaces it.
  // This avoids both duplicate tails and stale items reappearing one frame late.
  flushScheduledDeltas();
  if (
    (event.method === "account/login/completed" && params.success === true) ||
    event.method === "account/updated"
  ) {
    if (context.kind === "control") {
      queueMicrotask(() => void useAgentChatStore.getState().refreshAccount());
    }
  }
  if (event.method === "account/login/completed" && context.kind === "control") {
    codexSessionManager.releaseControl();
  }
  useAgentChatStore.setState((state) => {
    if (event.method === "account/login/completed") {
      const success = params.success === true;
      return {
        loginStatus: success ? "idle" : "error",
        loginError: success ? null : stringValue(params.error, "Codex login failed."),
      };
    }
    if (event.method === "account/rateLimits/updated") {
      const update = normalizeRateLimits(params.rateLimits);
      if (!update) return state;
      return {
        rateLimits: state.rateLimits
          ? {
              ...state.rateLimits,
              ...update,
              limitId: update.limitId ?? state.rateLimits.limitId,
              limitName: update.limitName ?? state.rateLimits.limitName,
              primary: update.primary ?? state.rateLimits.primary,
              secondary: update.secondary ?? state.rateLimits.secondary,
              planType: update.planType ?? state.rateLimits.planType,
            }
          : update,
      };
    }
    if (event.method === "thread/started" && isRecord(params.thread)) {
      const summary = threadSummary(params.thread as unknown as CodexThread);
      return {
        threadsByPath: {
          ...state.threadsByPath,
          [summary.path]: sortThreadSummaries([
            summary,
            ...(state.threadsByPath[summary.path] ?? []).filter((thread) => thread.id !== summary.id),
          ]),
        },
      };
    }
    if (event.method === "thread/name/updated" && threadId) {
      const name = stringValue(params.threadName);
      return {
        threadsByPath: updateThreadSummary(state.threadsByPath, threadId, (thread) => ({
          ...thread,
          title: name || thread.title,
        })),
        conversations: state.conversations[threadId]
          ? {
              ...state.conversations,
              [threadId]: {
                ...state.conversations[threadId],
                title: name || state.conversations[threadId].title,
              },
            }
          : state.conversations,
      };
    }
    if (event.method === "thread/status/changed" && threadId) {
      const status = isRecord(params.status)
        ? stringValue(params.status.type, "idle")
        : stringValue(params.status, "idle");
      return {
        threadsByPath: updateThreadSummary(state.threadsByPath, threadId, (thread) => ({
          ...thread,
          status,
        })),
      };
    }
    if ((event.method === "thread/goal/updated" || event.method === "thread/goal/cleared") && threadId) {
      const conversation = state.conversations[threadId];
      if (!conversation) return state;
      return {
        conversations: {
          ...state.conversations,
          [threadId]: {
            ...conversation,
            goal: event.method === "thread/goal/cleared" || !isRecord(params.goal)
              ? null
              : params.goal as unknown as AgentConversation["goal"],
          },
        },
      };
    }
    if (event.method === "thread/settings/updated" && threadId && isRecord(params.threadSettings)) {
      const conversation = state.conversations[threadId];
      if (!conversation) return state;
      const settings = params.threadSettings;
      const collaboration = isRecord(settings.collaborationMode)
        ? stringValue(settings.collaborationMode.mode)
        : "";
      return {
        conversations: {
          ...state.conversations,
          [threadId]: {
            ...conversation,
            model: stringValue(settings.model, conversation.model),
            reasoningEffort: typeof settings.effort === "string"
              ? settings.effort
              : conversation.reasoningEffort,
            serviceTier: typeof settings.serviceTier === "string" ? settings.serviceTier : null,
            personality: settings.personality === "none" || settings.personality === "friendly" || settings.personality === "pragmatic"
              ? settings.personality
              : conversation.personality,
            collaborationMode: collaboration === "plan" ? "plan" : "default",
          },
        },
      };
    }
    if (event.method === "thread/tokenUsage/updated" && threadId && isRecord(params.tokenUsage)) {
      const conversation = state.conversations[threadId];
      const total = isRecord(params.tokenUsage.total) ? params.tokenUsage.total : {};
      if (!conversation || typeof total.totalTokens !== "number") return state;
      return {
        conversations: {
          ...state.conversations,
          [threadId]: {
            ...conversation,
            tokenUsage: {
              totalTokens: total.totalTokens,
              modelContextWindow:
                typeof params.tokenUsage.modelContextWindow === "number"
                  ? params.tokenUsage.modelContextWindow
                  : null,
              inputTokens: Math.max(
                0,
                Number(total.inputTokens ?? 0) - Number(total.cachedInputTokens ?? 0),
              ),
              outputTokens: Number(total.outputTokens ?? 0),
              cacheReadTokens: Number(total.cachedInputTokens ?? 0),
              cacheWriteTokens: 0,
            },
          },
        },
      };
    }
    if (event.method === "model/rerouted" && threadId) {
      const conversation = state.conversations[threadId];
      if (!conversation) return state;
      return {
        conversations: {
          ...state.conversations,
          [threadId]: { ...conversation, model: stringValue(params.toModel, conversation.model) },
        },
      };
    }
    if (event.method === "item/fileChange/patchUpdated" && threadId && turnId) {
      const conversation = state.conversations[threadId];
      if (!conversation || !Array.isArray(params.changes)) return state;
      const itemId = stringValue(params.itemId);
      const turns = conversation.turns.map((turn) => {
        if (turn.id !== turnId) return turn;
        const current = turn.items.find((item) => item.id === itemId);
        const item: AgentItem = {
          ...(current ?? { id: itemId, type: "fileChange" }),
          changes: params.changes,
          status: "inProgress",
        };
        return { ...turn, items: replaceItem(turn.items, item) };
      });
      return { conversations: { ...state.conversations, [threadId]: { ...conversation, turns } } };
    }
    if (event.method === "turn/plan/updated" && threadId && turnId) {
      const conversation = state.conversations[threadId];
      if (!conversation || !Array.isArray(params.plan)) return state;
      const item: AgentItem = {
        id: `plan-${turnId}`,
        type: "plan",
        plan: params.plan,
        explanation: params.explanation,
      };
      const turns = conversation.turns.map((turn) =>
        turn.id === turnId ? { ...turn, items: replaceItem(turn.items, item) } : turn,
      );
      return { conversations: { ...state.conversations, [threadId]: { ...conversation, turns } } };
    }
    if (event.method === "item/mcpToolCall/progress" && threadId && turnId) {
      const conversation = state.conversations[threadId];
      if (!conversation) return state;
      const itemId = stringValue(params.itemId);
      const turns = conversation.turns.map((turn) => {
        if (turn.id !== turnId) return turn;
        const current = turn.items.find((item) => item.id === itemId);
        if (!current) return turn;
        const progress = Array.isArray(current.progress)
          ? current.progress.filter((value): value is string => typeof value === "string")
          : [];
        return {
          ...turn,
          items: replaceItem(turn.items, {
            ...current,
            progress: [...progress, stringValue(params.message)].filter(Boolean),
          }),
        };
      });
      return { conversations: { ...state.conversations, [threadId]: { ...conversation, turns } } };
    }
    if (event.method === "item/started" || event.method === "item/completed") {
      if (!isRecord(params.item) || !threadId || !turnId) return state;
      const incoming: AgentItem = {
        ...(params.item as AgentItem),
        __completed: event.method === "item/completed",
      };
      const conversation = state.conversations[threadId];
      if (!conversation) return state;
      const turns = conversation.turns.map((turn) =>
        turn.id === turnId ? { ...turn, items: replaceItem(turn.items, incoming) } : turn,
      );
      return { conversations: { ...state.conversations, [threadId]: { ...conversation, turns } } };
    }
    if (event.method === "turn/started" && isRecord(params.turn) && threadId) {
      const conversation = state.conversations[threadId];
      if (!conversation) return state;
      const raw = params.turn;
      const turn: AgentTurn = {
        id: stringValue(raw.id),
        items: Array.isArray(raw.items) ? (raw.items as AgentItem[]) : [],
        status: "inProgress",
        error: null,
        startedAt: typeof raw.startedAt === "number" ? raw.startedAt : null,
      };
      const existing = conversation.turns.findIndex((candidate) => candidate.id === turn.id);
      const turns = [...conversation.turns];
      if (existing >= 0) turns[existing] = { ...turns[existing], ...turn, items: turns[existing].items };
      else {
        const optimistic = conversation.activeTurnId?.startsWith("turn-")
          ? turns.findIndex((candidate) => candidate.id === conversation.activeTurnId)
          : -1;
        if (optimistic >= 0) {
          turns[optimistic] = { ...turns[optimistic], ...turn, items: turns[optimistic].items };
        } else {
          turns.push(turn);
        }
      }
      return {
        conversations: {
          ...state.conversations,
          [threadId]: { ...conversation, turns, activeTurnId: turn.id, loading: false, error: null },
        },
        threadsByPath: updateThreadSummary(state.threadsByPath, threadId, (thread) => ({
          ...thread,
          status: "active",
        })),
      };
    }
    if (event.method === "turn/completed" && isRecord(params.turn) && threadId) {
      const conversation = state.conversations[threadId];
      if (!conversation) return state;
      const raw = params.turn;
      const incoming: CodexTurn = {
        id: stringValue(raw.id),
        items: Array.isArray(raw.items) ? (raw.items as AgentItem[]) : [],
        status: statusFromUnknown(raw.status),
        error: isRecord(raw.error) ? { message: stringValue(raw.error.message) } : null,
        startedAt: typeof raw.startedAt === "number" ? raw.startedAt : null,
        completedAt: typeof raw.completedAt === "number" ? raw.completedAt : null,
        durationMs: typeof raw.durationMs === "number" ? raw.durationMs : null,
      };
      const existing = conversation.turns.findIndex((candidate) => candidate.id === incoming.id);
      const turns = [...conversation.turns];
      const merged = mergeCompletedTurn(existing >= 0 ? turns[existing] : undefined, incoming);
      if (existing >= 0) turns[existing] = merged;
      else turns.push(merged);
      const mergedConversation = {
        ...conversation,
        turns,
        activeTurnId: null,
        loading: false,
        error: merged.error ?? null,
      };
      const threadsByPath = updateThreadSummary(state.threadsByPath, threadId, (thread) => ({
        ...thread,
        status: "idle",
        updatedAt: Math.floor(Date.now() / 1000),
      }));
      return {
        conversations: {
          ...state.conversations,
          [threadId]: mergedConversation,
        },
        threadsByPath: conversationDiffPatch(threadsByPath, mergedConversation) ?? threadsByPath,
      };
    }
    if (event.method === "serverRequest/resolved") {
      const requestId = params.requestId;
      const requestsByThread: Record<string, AgentPendingRequest[]> = {};
      for (const [key, requests] of Object.entries(state.requestsByThread)) {
        requestsByThread[key] = requests.filter(
          (request) =>
            request.sessionId !== context.sessionId || request.requestId !== requestId,
        );
      }
      return { requestsByThread };
    }
    if ((event.method === "thread/archived" || event.method === "thread/deleted") && threadId) {
      const threadsByPath = updateThreadSummary(state.threadsByPath, threadId, (thread) =>
        event.method === "thread/deleted" ? null : { ...thread, archived: true },
      );
      return {
        threadsByPath,
        activeThreadByPath: Object.fromEntries(
          Object.entries(state.activeThreadByPath).map(([path, activeId]) => [
            path,
            activeId === threadId ? null : activeId,
          ]),
        ),
      };
    }
    if (event.method === "thread/unarchived" && threadId) {
      return {
        threadsByPath: updateThreadSummary(state.threadsByPath, threadId, (thread) => ({
          ...thread,
          archived: false,
        })),
      };
    }
    if (event.method === "error") {
      const nestedError = isRecord(params.error) ? params.error : null;
      const message = stringValue(
        params.message,
        nestedError
          ? stringValue(nestedError.message, "Codex hat einen unbekannten Fehler gemeldet.")
          : "Codex hat einen unbekannten Fehler gemeldet.",
      );
      if (threadId && state.conversations[threadId]) {
        return {
          conversations: {
            ...state.conversations,
            [threadId]: { ...state.conversations[threadId], error: message, loading: false },
          },
        };
      }
      return { connectionError: message };
    }
    return state;
  });
}

function attachListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  codexSessionManager.onEvent((context, event) => handleEvent(context, event));
  codexSessionManager.onRequest((context, rpcRequest) => {
    if (rpcRequest.method === "currentTime/read") {
      const client = codexSessionManager.clientForSession(context.sessionId);
      if (client) {
        void client.respond(rpcRequest.id, { currentTimeAt: Math.floor(Date.now() / 1000) })
          .finally(() => codexSessionManager.resolveRequest(context.sessionId, rpcRequest.id));
      }
      return;
    }
    const request = requestFromRpc(context, rpcRequest);
    useAgentChatStore.setState((state) => ({
      requestsByThread: {
        ...state.requestsByThread,
        [request.threadId]: [
          ...(state.requestsByThread[request.threadId] ?? []).filter(
            (candidate) =>
              candidate.sessionId !== request.sessionId ||
              candidate.requestId !== request.requestId,
          ),
          request,
        ],
      },
    }));
  });
  codexSessionManager.onStatus((event) => {
    useAgentChatStore.setState((state) => {
      if (event.type === "diagnostic") {
        const diagnostics = [...state.diagnostics, String(event.value)].slice(-80);
        return { diagnostics };
      }
      if (event.context.kind === "control") {
        if (event.type === "connecting") return { connectionStatus: "connecting" };
        if (event.type === "ready") return { connectionStatus: "ready", connectionError: null };
        if (event.type === "exit") {
          return {
            connectionStatus: "error",
            connectionError: `Codex wurde beendet (Code ${event.value}).`,
          };
        }
        if (event.type === "closed") return { connectionStatus: "idle" };
        return state;
      }
      const threadId = event.context.threadId;
      if (!threadId) return state;
      const sessionStatusByThread = {
        ...state.sessionStatusByThread,
        [threadId]: event.type === "connecting"
          ? "connecting" as const
          : event.type === "ready"
            ? "ready" as const
            : event.type === "exit"
              ? "error" as const
              : "idle" as const,
      };
      if (event.type !== "exit") {
        if (event.type === "closed" && state.visibleThreadId !== threadId) {
          return {
            sessionStatusByThread,
            conversations: Object.fromEntries(
              Object.entries(state.conversations).filter(([id]) => id !== threadId),
            ),
            requestsByThread: Object.fromEntries(
              Object.entries(state.requestsByThread).filter(([id]) => id !== threadId),
            ),
          };
        }
        return { sessionStatusByThread };
      }
      const conversation = state.conversations[threadId];
      const requestsByThread = Object.fromEntries(
        Object.entries(state.requestsByThread).map(([key, requests]) => [
          key,
          requests.filter((request) => request.sessionId !== event.context.sessionId),
        ]),
      );
      return {
        sessionStatusByThread,
        requestsByThread,
        conversations: conversation
          ? {
              ...state.conversations,
              [threadId]: {
                ...conversation,
                activeTurnId: null,
                loading: false,
                error: `Diese Codex-Session wurde beendet (Code ${event.value}).`,
              },
            }
          : state.conversations,
      };
    });
  });
}

let optimisticSequence = 1;
let connectPromise: Promise<void> | null = null;
const renameSequenceByThread = new Map<string, number>();
const skillsCache = new Map<string, { expiresAt: number; data: AgentSkill[] }>();
const appsCache = new Map<string, { expiresAt: number; data: AgentApp[] }>();
const skillsPromises = new Map<string, Promise<AgentSkill[]>>();
const appsPromises = new Map<string, Promise<AgentApp[]>>();
const permissionProfilePromises = new Map<string, Promise<void>>();
const fileSearchCache = new Map<string, { expiresAt: number; data: AgentFileMatch[] }>();
const fileSearchPromises = new Map<string, Promise<AgentFileMatch[]>>();
const persistedCatalog = loadAgentSessionCatalog();
function optimisticId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${optimisticSequence++}`;
}

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

      loadThreads: async (paths) => {
        const unique = [...new Set(paths.filter(Boolean))];
        if (!unique.length) return;
        // ponytail: thread/list can only return archived or non-archived, never both.
        // Archived threads are excluded from reconciliation and kept as-is instead.
        const trackedIdsByPath = new Map(
          unique.map((path) => [
            path,
            new Set(
              (get().threadsByPath[path] ?? [])
                .filter((thread) => !thread.archived)
                .map((thread) => thread.id),
            ),
          ]),
        );
        set((state) => ({
          loadingPaths: {
            ...state.loadingPaths,
            ...Object.fromEntries(unique.map((path) => [path, true])),
          },
        }));

        if (![...trackedIdsByPath.values()].some((ids) => ids.size > 0)) {
          set((state) => ({
            loadingPaths: {
              ...state.loadingPaths,
              ...Object.fromEntries(unique.map((path) => [path, false])),
            },
          }));
          return;
        }

        attachListeners();
        const client = await codexSessionManager.controlClient();
        try {
          const results = await Promise.all(unique.map(async (path) => {
            const trackedIds = trackedIdsByPath.get(path) ?? new Set<string>();
            if (!trackedIds.size) return { path, trackedIds, threads: [] as CodexThread[] };
            const found = new Map<string, CodexThread>();
            let cursor: string | null = null;
            do {
              const response = await client.listThreads(path, cursor);
              for (const thread of response.data) {
                if (trackedIds.has(thread.id)) found.set(thread.id, thread);
              }
              cursor = response.nextCursor;
            } while (cursor && found.size < trackedIds.size);
            return { path, trackedIds, threads: [...found.values()] };
          }));

          const missingIds = new Set<string>();
          for (const result of results) {
            const foundIds = new Set(result.threads.map((thread) => thread.id));
            for (const id of result.trackedIds) {
              if (!foundIds.has(id)) missingIds.add(id);
            }
          }
          await Promise.all([...missingIds].map((id) => codexSessionManager.closeThread(id)));

          let clearVisibleThread = false;
          set((state) => {
            const threadsByPath = { ...state.threadsByPath };
            const loadingPaths = { ...state.loadingPaths };
            const activeThreadByPath = { ...state.activeThreadByPath };
            for (const { path, trackedIds, threads } of results) {
              // Preserve sessions created while this reconciliation was in flight.
              const newThreads = (state.threadsByPath[path] ?? []).filter(
                (thread) => !trackedIds.has(thread.id),
              );
              const previous = new Map(
                (state.threadsByPath[path] ?? []).map((thread) => [thread.id, thread]),
              );
              const reconciled = sortThreadSummaries([
                ...threads.map((thread) =>
                  keepThreadDiff(threadSummary(thread), previous.get(thread.id)),
                ),
                ...newThreads,
              ]);
              threadsByPath[path] = reconciled;
              loadingPaths[path] = false;
              if (
                activeThreadByPath[path] &&
                !reconciled.some((thread) => thread.id === activeThreadByPath[path])
              ) {
                activeThreadByPath[path] = null;
              }
            }
            clearVisibleThread = Boolean(
              state.visibleThreadId && missingIds.has(state.visibleThreadId),
            );
            return {
              threadsByPath,
              loadingPaths,
              activeThreadByPath,
              visibleThreadId: clearVisibleThread ? null : state.visibleThreadId,
              conversations: Object.fromEntries(
                Object.entries(state.conversations).filter(([id]) => !missingIds.has(id)),
              ),
              requestsByThread: Object.fromEntries(
                Object.entries(state.requestsByThread).filter(([id]) => !missingIds.has(id)),
              ),
              sessionStatusByThread: Object.fromEntries(
                Object.entries(state.sessionStatusByThread).filter(([id]) => !missingIds.has(id)),
              ),
            };
          });
          if (clearVisibleThread) codexSessionManager.setVisibleThread(null);
        } catch (error) {
          set((state) => ({
            loadingPaths: {
              ...state.loadingPaths,
              ...Object.fromEntries(unique.map((path) => [path, false])),
            },
            diagnostics: [
              ...state.diagnostics,
              `Thread-Katalog konnte nicht abgeglichen werden: ${errorMessage(error)}`,
            ].slice(-80),
          }));
        } finally {
          codexSessionManager.releaseControl();
        }
      },

      createThread: async (path) => {
        attachListeners();
        const state = get();
        const { runtime } = await codexSessionManager.startThread({
          cwd: path,
          model: state.model ?? undefined,
          serviceTier: state.serviceTier,
          personality: state.personality,
          approvalPolicy: state.approvalPolicy,
          sandbox: state.sandboxMode,
          permissions: state.permissionProfile,
        });
        const conversation = conversationFromRuntime(runtime);
        const summary = threadSummary(runtime.thread);
        codexSessionManager.setVisibleThread(conversation.threadId);
        set((current) => ({
          conversations: { ...current.conversations, [conversation.threadId]: conversation },
          visibleThreadId: conversation.threadId,
          activeThreadByPath: { ...current.activeThreadByPath, [path]: conversation.threadId },
          threadsByPath: {
            ...current.threadsByPath,
            [path]: sortThreadSummaries([
              summary,
              ...(current.threadsByPath[path] ?? []).filter((item) => item.id !== summary.id),
            ]),
          },
          sessionStatusByThread: {
            ...current.sessionStatusByThread,
            [conversation.threadId]: "ready",
          },
        }));
        return conversation.threadId;
      },

      openThread: async (path, threadId) => {
        attachListeners();
        codexSessionManager.setVisibleThread(threadId);
        set((state) => ({
          visibleThreadId: threadId,
          ...(state.activeThreadByPath[path] === threadId
            ? {}
            : { activeThreadByPath: { ...state.activeThreadByPath, [path]: threadId } }),
        }));
        const existingConversation = get().conversations[threadId];
        if (existingConversation && !existingConversation.error) return;
        set((state) => ({
          conversations: {
            ...state.conversations,
            [threadId]: {
              threadId,
              path,
              title:
                state.threadsByPath[path]?.find((thread) => thread.id === threadId)?.title ??
                i18n.t("agentChat.conversation"),
              model: state.model ?? "",
              reasoningEffort: state.reasoningEffort,
              serviceTier: state.serviceTier,
              personality: state.personality,
              collaborationMode: state.collaborationMode,
              approvalPolicy: state.approvalPolicy,
              sandboxMode: state.sandboxMode,
              turns: [],
              activeTurnId: null,
              loading: true,
              error: null,
            },
          },
        }));
        try {
          const { client, runtime } = await codexSessionManager.threadClient(threadId, path);
          if (!runtime) {
            set((state) => ({
              conversations: {
                ...state.conversations,
                [threadId]: { ...state.conversations[threadId], loading: false, error: null },
              },
            }));
            return;
          }
          const goal = await client.getGoal(threadId).then((response) => response.goal).catch(() => null);
          const conversation = { ...conversationFromRuntime(runtime), goal };
          set((state) => ({
            conversations: {
              ...state.conversations,
              [threadId]: conversation,
            },
            threadsByPath:
              conversationDiffPatch(state.threadsByPath, conversation) ?? state.threadsByPath,
          }));
        } catch (error) {
          if (isMissingRolloutError(error)) {
            codexSessionManager.setVisibleThread(null);
            set((state) => ({
              threadsByPath: {
                ...state.threadsByPath,
                [path]: (state.threadsByPath[path] ?? []).filter(
                  (thread) => thread.id !== threadId,
                ),
              },
              activeThreadByPath: {
                ...state.activeThreadByPath,
                [path]: state.activeThreadByPath[path] === threadId
                  ? null
                  : state.activeThreadByPath[path],
              },
              conversations: Object.fromEntries(
                Object.entries(state.conversations).filter(([id]) => id !== threadId),
              ),
              requestsByThread: Object.fromEntries(
                Object.entries(state.requestsByThread).filter(([id]) => id !== threadId),
              ),
              sessionStatusByThread: Object.fromEntries(
                Object.entries(state.sessionStatusByThread).filter(([id]) => id !== threadId),
              ),
              visibleThreadId: state.visibleThreadId === threadId ? null : state.visibleThreadId,
            }));
            return;
          }
          set((state) => ({
            conversations: {
              ...state.conversations,
              [threadId]: {
                ...state.conversations[threadId],
                loading: false,
                error: errorMessage(error),
              },
            },
          }));
        }
      },

      sendMessage: async (path, text, attachments = []) => {
        let threadId = get().activeThreadByPath[path];
        if (!threadId) threadId = await get().createThread(path);
        let state = get();
        let conversation = state.conversations[threadId];
        if (!conversation) throw new Error("Unterhaltung konnte nicht geöffnet werden.");
        if (conversation.activeTurnId) {
          await get().steerMessage(threadId, text, attachments);
          return;
        }
        const { client, runtime } = await codexSessionManager.threadClient(threadId, path);
        if (runtime) {
          set((current) => ({
            conversations: {
              ...current.conversations,
              [threadId]: {
                ...conversationFromRuntime(runtime),
                goal: current.conversations[threadId]?.goal ?? null,
              },
            },
          }));
          state = get();
          conversation = state.conversations[threadId];
          if (!conversation) throw new Error("Unterhaltung konnte nicht geöffnet werden.");
        }
        const clientId = optimisticId("message");
        const turnId = optimisticId("turn");
        const input: CodexUserInput[] = [
          { type: "text", text, text_elements: [] },
          ...attachments.map(inputFromAttachment),
        ];
        const selectedCollaborationMode = state.collaborationModes.find(
          (option) => option.mode === state.collaborationMode,
        );
        const optimisticItem: AgentItem = {
          id: clientId,
          clientId,
          type: "userMessage",
          content: input,
        };
        const optimisticTurn: AgentTurn = {
          id: turnId,
          items: [optimisticItem],
          status: "inProgress",
          error: null,
          startedAt: Date.now() / 1000,
        };
        const firstTurn = conversation.turns.length === 0;
        const initialTitle = firstTurn
          ? (text.trim().split("\n")[0] || attachments[0]?.name || conversation.title).slice(0, 80)
          : conversation.title;
        set((current) => {
          return {
            conversations: {
              ...current.conversations,
              [threadId]: {
                ...current.conversations[threadId],
                title: initialTitle,
                turns: [...current.conversations[threadId].turns, optimisticTurn],
                activeTurnId: turnId,
                error: null,
              },
            },
            threadsByPath: {
              ...current.threadsByPath,
              [path]: sortThreadSummaries((current.threadsByPath[path] ?? []).map((summary) =>
                summary.id === threadId
                  ? {
                      ...summary,
                      title: initialTitle,
                      preview: firstTurn ? (text.trim() || attachments.map((item) => item.name).join(", ")).slice(0, 160) : summary.preview,
                      updatedAt: Math.floor(Date.now() / 1000),
                      status: "active",
                    }
                  : summary,
              )),
            },
          };
        });
        try {
          // Persist the instant local title in parallel. Starting the model turn
          // stays on the critical path; a naming failure never delays or fails it.
          const titleRequest = firstTurn
            ? client.renameThread(threadId, initialTitle).catch(() => undefined)
            : Promise.resolve(undefined);
          const response = await client.startTurn(threadId, input, clientId, {
            model: state.model ?? undefined,
            effort: state.reasoningEffort,
            approvalPolicy: state.approvalPolicy,
            sandboxPolicy: state.permissionProfile ? undefined : sandboxPolicyFor(state.sandboxMode),
            permissions: state.permissionProfile,
            serviceTier: state.serviceTier,
            personality: state.personality,
            collaborationMode: {
              mode: state.collaborationMode,
              settings: {
                model: selectedCollaborationMode?.model ?? state.model ?? conversation.model,
                reasoning_effort:
                  selectedCollaborationMode?.reasoningEffort ?? state.reasoningEffort,
                developer_instructions: null,
              },
            },
          });
          await titleRequest;
          set((current) => {
            const currentConversation = current.conversations[threadId];
            if (!currentConversation) return current;
            const turns = currentConversation.turns.map((turn) =>
              turn.id === turnId ? { ...turn, id: response.turn.id } : turn,
            );
            return {
              conversations: {
                ...current.conversations,
                [threadId]: { ...currentConversation, turns, activeTurnId: response.turn.id },
              },
            };
          });
        } catch (error) {
          set((current) => ({
            conversations: {
              ...current.conversations,
              [threadId]: {
                ...current.conversations[threadId],
                activeTurnId: null,
                error: errorMessage(error),
                turns: current.conversations[threadId].turns.map((turn) =>
                  turn.id === turnId ? { ...turn, status: "failed", error: errorMessage(error) } : turn,
                ),
              },
            },
          }));
          throw error;
        }
      },

      steerMessage: async (threadId, text, attachments = []) => {
        const conversation = get().conversations[threadId];
        const expectedTurnId = conversation?.activeTurnId;
        if (!expectedTurnId) throw new Error("Es gibt keinen laufenden Turn.");
        const sessionId = codexSessionManager.sessionIdForThread(threadId);
        const client = sessionId ? codexSessionManager.clientForSession(sessionId) : null;
        if (!client) throw new Error("Die laufende Codex-Session ist nicht mehr verbunden.");
        const clientId = optimisticId("message");
        const input: CodexUserInput[] = [
          { type: "text", text, text_elements: [] },
          ...attachments.map(inputFromAttachment),
        ];
        set((current) => ({
          conversations: {
            ...current.conversations,
            [threadId]: {
              ...current.conversations[threadId],
              turns: current.conversations[threadId].turns.map((turn) =>
                turn.id === expectedTurnId
                  ? {
                      ...turn,
                      items: [
                        ...turn.items,
                        { id: clientId, clientId, type: "userMessage", content: input, __queued: true },
                      ],
                    }
                  : turn,
              ),
            },
          },
        }));
        try {
          await client.steer(threadId, expectedTurnId, input, clientId);
        } catch (error) {
          set((current) => ({
            conversations: {
              ...current.conversations,
              [threadId]: {
                ...current.conversations[threadId],
                turns: current.conversations[threadId].turns.map((turn) => ({
                  ...turn,
                  items: turn.items.filter((item) => item.id !== clientId),
                })),
              },
            },
          }));
          throw error;
        }
      },

      interrupt: async (threadId) => {
        const turnId = get().conversations[threadId]?.activeTurnId;
        if (!turnId) return;
        const sessionId = codexSessionManager.sessionIdForThread(threadId);
        const client = sessionId ? codexSessionManager.clientForSession(sessionId) : null;
        if (!client) throw new Error("Die laufende Codex-Session ist nicht mehr verbunden.");
        await client.interrupt(threadId, turnId);
      },

      respondToRequest: async (request, result) => {
        const client = codexSessionManager.clientForSession(request.sessionId);
        if (!client) throw new Error("Diese Codex-Session ist nicht mehr verbunden.");
        await client.respond(request.requestId, result);
        codexSessionManager.resolveRequest(request.sessionId, request.requestId);
        set((state) => ({
          requestsByThread: {
            ...state.requestsByThread,
            [request.threadId]: (state.requestsByThread[request.threadId] ?? []).filter(
              (candidate) =>
                candidate.sessionId !== request.sessionId ||
                candidate.requestId !== request.requestId,
            ),
          },
        }));
      },

      rejectUnsupportedRequest: async (request) => {
        const client = codexSessionManager.clientForSession(request.sessionId);
        if (!client) throw new Error("Diese Codex-Session ist nicht mehr verbunden.");
        await client.declineUnknown(request.requestId);
        codexSessionManager.resolveRequest(request.sessionId, request.requestId);
        set((state) => ({
          requestsByThread: {
            ...state.requestsByThread,
            [request.threadId]: (state.requestsByThread[request.threadId] ?? []).filter(
              (candidate) =>
                candidate.sessionId !== request.sessionId ||
                candidate.requestId !== request.requestId,
            ),
          },
        }));
      },

      archiveThread: async (path, threadId) => {
        const client = await codexSessionManager.controlClient();
        try {
          await client.archiveThread(threadId);
        } finally {
          codexSessionManager.releaseControl();
        }
        await codexSessionManager.closeThread(threadId);
        if (get().visibleThreadId === threadId) codexSessionManager.setVisibleThread(null);
        set((state) => ({
          threadsByPath: {
            ...state.threadsByPath,
            [path]: (state.threadsByPath[path] ?? []).map((thread) =>
              thread.id === threadId ? { ...thread, archived: true } : thread,
            ),
          },
          activeThreadByPath: {
            ...state.activeThreadByPath,
            [path]: state.activeThreadByPath[path] === threadId ? null : state.activeThreadByPath[path],
          },
          conversations: Object.fromEntries(
            Object.entries(state.conversations).filter(([id]) => id !== threadId),
          ),
          requestsByThread: Object.fromEntries(
            Object.entries(state.requestsByThread).filter(([id]) => id !== threadId),
          ),
          sessionStatusByThread: Object.fromEntries(
            Object.entries(state.sessionStatusByThread).filter(([id]) => id !== threadId),
          ),
          visibleThreadId: state.visibleThreadId === threadId ? null : state.visibleThreadId,
        }));
      },

      unarchiveThread: async (path, threadId) => {
        const client = await codexSessionManager.controlClient();
        try {
          await client.unarchiveThread(threadId);
        } finally {
          codexSessionManager.releaseControl();
        }
        set((state) => ({
          threadsByPath: {
            ...state.threadsByPath,
            [path]: sortThreadSummaries(
              (state.threadsByPath[path] ?? []).map((thread) =>
                thread.id === threadId ? { ...thread, archived: false } : thread,
              ),
            ),
          },
        }));
      },

      deleteThread: async (path, threadId) => {
        const client = await codexSessionManager.controlClient();
        try {
          await client.deleteThread(threadId);
        } finally {
          codexSessionManager.releaseControl();
        }
        await codexSessionManager.closeThread(threadId);
        if (get().visibleThreadId === threadId) codexSessionManager.setVisibleThread(null);
        set((state) => ({
          threadsByPath: {
            ...state.threadsByPath,
            [path]: (state.threadsByPath[path] ?? []).filter((thread) => thread.id !== threadId),
          },
          activeThreadByPath: {
            ...state.activeThreadByPath,
            [path]: state.activeThreadByPath[path] === threadId ? null : state.activeThreadByPath[path],
          },
          conversations: Object.fromEntries(
            Object.entries(state.conversations).filter(([id]) => id !== threadId),
          ),
          requestsByThread: Object.fromEntries(
            Object.entries(state.requestsByThread).filter(([id]) => id !== threadId),
          ),
          sessionStatusByThread: Object.fromEntries(
            Object.entries(state.sessionStatusByThread).filter(([id]) => id !== threadId),
          ),
          visibleThreadId: state.visibleThreadId === threadId ? null : state.visibleThreadId,
        }));
      },

      renameThread: async (path, threadId, name) => {
        const trimmed = name.trim().slice(0, 256);
        if (!trimmed) return;
        const before = get();
        const previousTitle = before.threadsByPath[path]?.find((thread) => thread.id === threadId)?.title;
        if (previousTitle === trimmed) return;
        const sequence = (renameSequenceByThread.get(threadId) ?? 0) + 1;
        renameSequenceByThread.set(threadId, sequence);
        set((state) => ({
          threadsByPath: {
            ...state.threadsByPath,
            [path]: (state.threadsByPath[path] ?? []).map((thread) =>
              thread.id === threadId ? { ...thread, title: trimmed } : thread,
            ),
          },
          conversations: state.conversations[threadId]
            ? {
                ...state.conversations,
                [threadId]: { ...state.conversations[threadId], title: trimmed },
              }
            : state.conversations,
        }));
        const client = await codexSessionManager.controlClient();
        try {
          await client.renameThread(threadId, trimmed);
        } catch (error) {
          if (renameSequenceByThread.get(threadId) === sequence && previousTitle) {
            set((state) => ({
              threadsByPath: {
                ...state.threadsByPath,
                [path]: (state.threadsByPath[path] ?? []).map((thread) =>
                  thread.id === threadId ? { ...thread, title: previousTitle } : thread,
                ),
              },
              conversations: state.conversations[threadId]
                ? {
                    ...state.conversations,
                    [threadId]: { ...state.conversations[threadId], title: previousTitle },
                  }
                : state.conversations,
            }));
          }
          throw error;
        } finally {
          codexSessionManager.releaseControl();
        }
      },

      setThreadPinned: async (path, threadId, isPinned) => {
        const client = await codexSessionManager.controlClient();
        let response;
        try {
          response = await client.setThreadPinned(threadId, isPinned);
        } finally {
          codexSessionManager.releaseControl();
        }
        const summary = threadSummary(response.thread);
        set((state) => ({
          threadsByPath: {
            ...state.threadsByPath,
            [path]: sortThreadSummaries(
              (state.threadsByPath[path] ?? []).map((thread) =>
                thread.id === threadId ? summary : thread,
              ),
            ),
          },
        }));
      },

      startReview: async (threadId, instructions) => {
        const conversation = get().conversations[threadId];
        if (!conversation) throw new Error("Unterhaltung konnte nicht geöffnet werden.");
        const { client } = await codexSessionManager.threadClient(threadId, conversation.path);
        await client.startReview(
          threadId,
          instructions?.trim()
            ? { type: "custom", instructions: instructions.trim() }
            : { type: "uncommittedChanges" },
        );
      },

      compactThread: async (threadId) => {
        const conversation = get().conversations[threadId];
        if (conversation?.activeTurnId) {
          throw new Error("Ein laufender Turn kann nicht komprimiert werden.");
        }
        if (!conversation) throw new Error("Unterhaltung konnte nicht geöffnet werden.");
        const { client } = await codexSessionManager.threadClient(threadId, conversation.path);
        await client.compactThread(threadId);
      },

      forkThread: async (path, threadId) => {
        const state = get();
        if (state.conversations[threadId]?.activeTurnId) {
          throw new Error("Ein laufender Turn kann nicht verzweigt werden.");
        }
        const { client } = await codexSessionManager.threadClient(threadId, path);
        const runtime = await client.forkThread(threadId, {
          cwd: path,
          model: state.model ?? undefined,
          serviceTier: state.serviceTier,
          personality: state.personality,
          approvalPolicy: state.approvalPolicy,
          sandbox: state.sandboxMode,
          permissions: state.permissionProfile,
        });
        const conversation = conversationFromRuntime(runtime);
        const summary = threadSummary(runtime.thread);
        codexSessionManager.setVisibleThread(conversation.threadId);
        set((current) => ({
          conversations: { ...current.conversations, [conversation.threadId]: conversation },
          visibleThreadId: conversation.threadId,
          activeThreadByPath: { ...current.activeThreadByPath, [path]: conversation.threadId },
          threadsByPath: {
            ...current.threadsByPath,
            [path]: sortThreadSummaries([
              summary,
              ...(current.threadsByPath[path] ?? []).filter((item) => item.id !== summary.id),
            ]),
          },
          sessionStatusByThread: {
            ...current.sessionStatusByThread,
            [conversation.threadId]: "idle",
          },
        }));
        return conversation.threadId;
      },

      listSkills: async (path, forceReload = false) => {
        const cached = skillsCache.get(path);
        if (!forceReload && cached && cached.expiresAt > Date.now()) return cached.data;
        const pending = skillsPromises.get(path);
        if (pending) return pending;
        const promise = (async () => {
          const client = await codexSessionManager.controlClient();
          try {
            const response = await client.skills(path, forceReload);
            const data = response.data.find((entry) => entry.cwd === path)?.skills ?? [];
            if (skillsCache.size >= 8 && !skillsCache.has(path)) {
              skillsCache.delete(skillsCache.keys().next().value ?? "");
            }
            skillsCache.set(path, { data, expiresAt: Date.now() + 30_000 });
            return data;
          } finally {
            codexSessionManager.releaseControl();
          }
        })();
        skillsPromises.set(path, promise);
        try {
          return await promise;
        } finally {
          if (skillsPromises.get(path) === promise) skillsPromises.delete(path);
        }
      },

      loadPermissionProfiles: async (path) => {
        if (get().permissionProfilesPath === path && get().permissionProfiles.length) return;
        const pending = permissionProfilePromises.get(path);
        if (pending) return pending;
        const promise = (async () => {
          const client = await codexSessionManager.controlClient();
          try {
            const profiles: AgentPermissionProfile[] = [];
            let cursor: string | undefined;
            do {
              const response = await client.permissionProfiles(path, cursor);
              profiles.push(...response.data);
              cursor = response.nextCursor ?? undefined;
            } while (cursor);
            set((state) => ({
              permissionProfiles: profiles,
              permissionProfilesPath: path,
              permissionProfile: state.permissionProfile && profiles.some(
                (profile) => profile.id === state.permissionProfile && profile.allowed,
              )
                ? state.permissionProfile
                : null,
            }));
          } finally {
            codexSessionManager.releaseControl();
          }
        })();
        permissionProfilePromises.set(path, promise);
        try {
          await promise;
        } finally {
          if (permissionProfilePromises.get(path) === promise) permissionProfilePromises.delete(path);
        }
      },

      listApps: async (threadId) => {
        const cacheKey = threadId ?? "__global";
        const cached = appsCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.data;
        const pending = appsPromises.get(cacheKey);
        if (pending) return pending;
        const promise = (async () => {
          const client = await codexSessionManager.controlClient();
          try {
            const data: AgentApp[] = [];
            let cursor: string | undefined;
            do {
              const response = await client.apps(threadId, cursor);
              data.push(...response.data);
              cursor = response.nextCursor ?? undefined;
            } while (cursor);
            if (appsCache.size >= 16 && !appsCache.has(cacheKey)) {
              appsCache.delete(appsCache.keys().next().value ?? "");
            }
            appsCache.set(cacheKey, { data, expiresAt: Date.now() + 30_000 });
            return data;
          } finally {
            codexSessionManager.releaseControl();
          }
        })();
        appsPromises.set(cacheKey, promise);
        try {
          return await promise;
        } finally {
          if (appsPromises.get(cacheKey) === promise) appsPromises.delete(cacheKey);
        }
      },

      listMcpServers: async (threadId) => {
        const client = await codexSessionManager.controlClient();
        try {
          const data: AgentMcpServer[] = [];
          let cursor: string | undefined;
          do {
            const response = await client.mcpServers(threadId, cursor);
            data.push(...response.data.map((server) => ({
              name: server.name,
              tools: Object.keys(server.tools ?? {}),
              authStatus: typeof server.authStatus === "string"
                ? server.authStatus
                : stringValue(server.authStatus?.type, "unknown"),
            })));
            cursor = response.nextCursor ?? undefined;
          } while (cursor);
          return data;
        } finally {
          codexSessionManager.releaseControl();
        }
      },

      loginMcpServer: async (name, threadId) => {
        if (threadId) {
          const conversation = get().conversations[threadId];
          if (!conversation) throw new Error("Unterhaltung konnte nicht geöffnet werden.");
          const { client } = await codexSessionManager.threadClient(threadId, conversation.path);
          return (await client.loginMcpServer(name, threadId)).authorizationUrl;
        }
        const client = await codexSessionManager.controlClient();
        try {
          return (await client.loginMcpServer(name)).authorizationUrl;
        } finally {
          codexSessionManager.releaseControl();
        }
      },

      searchFiles: async (path, query) => {
        const cacheKey = `${path}\u0000${query.trim().toLocaleLowerCase()}`;
        const cached = fileSearchCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.data;
        const pending = fileSearchPromises.get(cacheKey);
        if (pending) return pending;
        const promise = (async () => {
          const client = await codexSessionManager.controlClient();
          try {
            const response = await client.fuzzyFiles(query, [path]);
            const data = response.files.map((file) => ({
              root: file.root,
              path: file.path,
              fileName: file.file_name,
              score: file.score,
            }));
            if (fileSearchCache.size >= 64) fileSearchCache.delete(fileSearchCache.keys().next().value ?? "");
            fileSearchCache.set(cacheKey, { expiresAt: Date.now() + 10_000, data });
            return data;
          } finally {
            codexSessionManager.releaseControl();
          }
        })();
        fileSearchPromises.set(cacheKey, promise);
        try {
          return await promise;
        } finally {
          if (fileSearchPromises.get(cacheKey) === promise) fileSearchPromises.delete(cacheKey);
        }
      },

      listHooks: async (path) => {
        const client = await codexSessionManager.controlClient();
        try {
          const response = await client.hooks(path);
          return response.data.find((entry) => entry.cwd === path)?.hooks ?? [];
        } finally {
          codexSessionManager.releaseControl();
        }
      },

      listPlugins: async (path) => {
        const client = await codexSessionManager.controlClient();
        try {
          const response = await client.plugins(path);
          const byId = new Map<string, AgentPlugin>();
          for (const marketplace of response.marketplaces) {
            for (const plugin of marketplace.plugins) byId.set(plugin.id, plugin);
          }
          return [...byId.values()];
        } finally {
          codexSessionManager.releaseControl();
        }
      },

      detectExternalAgentConfig: async (path) => {
        const client = await codexSessionManager.controlClient();
        try {
          return (await client.detectExternalAgentConfig([path])).items;
        } finally {
          codexSessionManager.releaseControl();
        }
      },

      listExternalAgentConfigImportHistories: async () => {
        const client = await codexSessionManager.controlClient();
        try {
          return (await client.externalAgentConfigImportHistories()).data;
        } finally {
          codexSessionManager.releaseControl();
        }
      },

      importExternalAgentConfig: async (items, onProgress) => {
        if (!items.length) throw new Error("Select at least one item to import.");
        const client = await codexSessionManager.controlClient();
        let expectedImportId: string | null = null;
        const completedBeforeResponse: Array<{
          importId: string;
          itemTypeResults: AgentExternalConfigImportTypeResult[];
        }> = [];
        let resolveCompletion!: (value: AgentExternalConfigImportTypeResult[]) => void;
        const completion = new Promise<AgentExternalConfigImportTypeResult[]>((resolve) => {
          resolveCompletion = resolve;
        });
        const dispose = codexSessionManager.onEvent((context, event) => {
          if (context.kind !== "control") return;
          if (
            event.method !== "externalAgentConfig/import/progress" &&
            event.method !== "externalAgentConfig/import/completed"
          ) return;
          const notification = externalImportNotification(event);
          if (!notification) return;
          if (event.method === "externalAgentConfig/import/progress") {
            if (!expectedImportId || notification.importId === expectedImportId) {
              onProgress?.(notification.itemTypeResults);
            }
            return;
          }
          if (!expectedImportId) {
            completedBeforeResponse.push(notification);
          } else if (notification.importId === expectedImportId) {
            resolveCompletion(notification.itemTypeResults);
          }
        });
        let timeout: ReturnType<typeof setTimeout> | null = null;
        try {
          const response = await client.importExternalAgentConfig(items);
          expectedImportId = response.importId;
          const earlyCompletion = completedBeforeResponse.find(
            (notification) => notification.importId === expectedImportId,
          );
          if (earlyCompletion) resolveCompletion(earlyCompletion.itemTypeResults);
          const timedOut = new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error("The import is still running. Reopen Import to inspect its history.")),
              5 * 60_000,
            );
          });
          const results = await Promise.race([completion, timedOut]);
          const now = Math.floor(Date.now() / 1000);
          const selectedSessions = items.flatMap((item) => item.details?.sessions ?? []);
          const selectedSessionBySource = new Map(
            selectedSessions.map((session) => [session.path, session]),
          );
          const importedSessions = results.flatMap((result) =>
            result.itemType === "SESSIONS"
              ? result.successes.filter(
                  (success) => Boolean(success.target),
                )
              : [],
          );
          if (importedSessions.length) {
            set((state) => {
              const threadsByPath = { ...state.threadsByPath };
              for (const session of importedSessions) {
                const threadId = session.target as string;
                const detectedSession = session.source
                  ? selectedSessionBySource.get(session.source)
                  : undefined;
                const path = session.cwd ?? detectedSession?.cwd;
                if (!path) continue;
                const sourceName = session.source?.split(/[\\/]/u).pop()?.replace(/\.jsonl$/u, "");
                const summary: AgentThreadSummary = {
                  id: threadId,
                  path,
                  title: session.title?.trim() || detectedSession?.title?.trim() || sourceName || "Imported Claude chat",
                  preview: "Imported from Claude Code",
                  createdAt: now,
                  updatedAt: now,
                  status: "idle",
                  modelProvider: "openai",
                  isPinned: false,
                };
                threadsByPath[path] = sortThreadSummaries([
                  summary,
                  ...(threadsByPath[path] ?? []).filter((thread) => thread.id !== threadId),
                ]);
              }
              return { threadsByPath };
            });
          }
          return results;
        } finally {
          if (timeout) clearTimeout(timeout);
          dispose();
          codexSessionManager.releaseControl();
        }
      },

      sendFeedback: async (reason, threadId, includeLogs = true) => {
        const client = await codexSessionManager.controlClient();
        try {
          const response = await client.feedback({
            classification: "bug",
            reason: reason.trim(),
            threadId,
            includeLogs,
          });
          return response.threadId;
        } finally {
          codexSessionManager.releaseControl();
        }
      },

      listBackgroundTerminals: async (threadId) => {
        const conversation = get().conversations[threadId];
        if (!conversation) return [];
        const { client } = await codexSessionManager.threadClient(threadId, conversation.path);
        return (await client.backgroundTerminals(threadId)).data;
      },

      stopBackgroundTerminals: async (threadId) => {
        const conversation = get().conversations[threadId];
        if (!conversation) return;
        const { client } = await codexSessionManager.threadClient(threadId, conversation.path);
        await client.cleanBackgroundTerminals(threadId);
      },

      terminateBackgroundTerminal: async (threadId, processId) => {
        const conversation = get().conversations[threadId];
        if (!conversation) return false;
        const { client } = await codexSessionManager.threadClient(threadId, conversation.path);
        return (await client.terminateBackgroundTerminal(threadId, processId)).terminated;
      },

      setGoal: async (threadId, objective) => {
        const conversation = get().conversations[threadId];
        if (!conversation) throw new Error("Unterhaltung konnte nicht geöffnet werden.");
        const { client } = await codexSessionManager.threadClient(threadId, conversation.path);
        const response = await client.setGoal(threadId, objective.trim());
        set((state) => ({
          conversations: state.conversations[threadId]
            ? {
                ...state.conversations,
                [threadId]: { ...state.conversations[threadId], goal: response.goal },
              }
            : state.conversations,
        }));
      },

      clearGoal: async (threadId) => {
        const conversation = get().conversations[threadId];
        if (!conversation) return;
        const { client } = await codexSessionManager.threadClient(threadId, conversation.path);
        await client.clearGoal(threadId);
        set((state) => ({
          conversations: state.conversations[threadId]
            ? {
                ...state.conversations,
                [threadId]: { ...state.conversations[threadId], goal: null },
              }
            : state.conversations,
        }));
      },

      setMemoryMode: async (threadId, mode) => {
        const conversation = get().conversations[threadId];
        if (!conversation) throw new Error("Unterhaltung konnte nicht geöffnet werden.");
        const { client } = await codexSessionManager.threadClient(threadId, conversation.path);
        await client.setMemoryMode(threadId, mode);
      },

      resetMemory: async () => {
        const client = await codexSessionManager.controlClient();
        try {
          await client.resetMemory();
        } finally {
          codexSessionManager.releaseControl();
        }
      },

      setModel: (model) => set((state) => {
        const option = state.models.find((candidate) => candidate.id === model);
        return {
          model,
          reasoningEffort: option?.reasoningEfforts.some(
            (effort) => effort.value === state.reasoningEffort,
          )
            ? state.reasoningEffort
            : (option?.defaultReasoningEffort ?? state.reasoningEffort),
          serviceTier: option?.serviceTiers.some((tier) => tier.id === state.serviceTier)
            ? state.serviceTier
            : option?.defaultServiceTier ?? null,
        };
      }),
      setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),
      setServiceTier: (serviceTier) => set({ serviceTier }),
      setPersonality: (personality) => set({ personality }),
      setCollaborationMode: (collaborationMode) => set({ collaborationMode }),
      setPermissionProfile: (permissionProfile) => set({ permissionProfile }),
      setRealtimeVoice: (realtimeVoice) => set({ realtimeVoice }),
      setApprovalPolicy: (approvalPolicy) => set({ approvalPolicy, permissionProfile: null }),
      setSandboxMode: (sandboxMode) => set({ sandboxMode, permissionProfile: null }),
      clearError: (threadId) => {
        if (!threadId) {
          set({ connectionError: null });
          return;
        }
        set((state) => ({
          conversations: state.conversations[threadId]
            ? {
                ...state.conversations,
                [threadId]: { ...state.conversations[threadId], error: null },
              }
            : state.conversations,
        }));
      },
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
