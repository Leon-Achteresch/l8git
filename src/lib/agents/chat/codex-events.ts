import { BARCODE_TOOL } from "@/lib/agents/barcode-spec";
import type { RpcNotification } from "@/lib/agents/rpc-client";
import { type CodexThread, type CodexTurn } from "@/lib/agents/providers/codex/protocol";
import type { AgentConversation, AgentItem, AgentPendingRequest, AgentTurn } from "@/lib/agents/types";
import { codexSessionManager, type CodexSessionContext } from "@/lib/agents/session-manager";
import { conversationDiffPatch } from "@/lib/agents/thread-diff";

import { isRecord, stringValue, sortThreadSummaries } from "@/lib/agents/chat/values";
import { useAgentChatStore } from "@/lib/agents/chat-store";
import {
  type DeltaUpdate,
  mergeCompletedTurn,
  normalizeRateLimits,
  replaceItem,
  requestFromRpc,
  statusFromUnknown,
  threadSummary,
  updateThreadSummary,
} from "@/lib/agents/chat/codex-normalize";
import { appsCache, skillsCache } from "@/lib/agents/chat/codex-state";

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

export function attachListeners(): void {
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
    if (
      rpcRequest.method === "item/tool/call" &&
      stringValue(rpcRequest.params?.tool) === BARCODE_TOOL.name
    ) {
      const client = codexSessionManager.clientForSession(context.sessionId);
      if (client) {
        void client.respond(rpcRequest.id, {
          contentItems: [{ type: "inputText", text: "Barcode wurde in der l8git-UI gerendert." }],
          success: true,
        }).finally(() => codexSessionManager.resolveRequest(context.sessionId, rpcRequest.id));
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
