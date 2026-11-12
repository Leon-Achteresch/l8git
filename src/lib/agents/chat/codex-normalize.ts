import type { RpcNotification, RpcServerRequest } from "@/lib/agents/rpc-client";
import {
  codexSandboxMode,
  type CodexThread,
  type CodexThreadRuntime,
  type CodexTurn,
  type CodexUserInput,
} from "@/lib/agents/providers/codex/protocol";
import type {
  AgentAccountUsage,
  AgentAttachment,
  AgentConversation,
  AgentExternalConfigImportTypeResult,
  AgentInputQuestion,
  AgentItem,
  AgentPendingRequest,
  AgentRateLimits,
  AgentThreadSummary,
  AgentTurn,
  AgentTurnStatus,
} from "@/lib/agents/types";
import { type CodexSessionContext } from "@/lib/agents/session-manager";
import { diffFromTurns } from "@/lib/agents/thread-diff";
import i18n from "@/lib/i18n";

import { isRecord, stringValue, errorMessage, sortThreadSummaries } from "@/lib/agents/chat/values";

export function isMissingRolloutError(error: unknown): boolean {
  return /no rollout found for thread id/i.test(errorMessage(error));
}

export function externalImportNotification(
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

export function threadSummary(thread: CodexThread): AgentThreadSummary {
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

export function updateThreadSummary(
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

export function inputFromAttachment(attachment: AgentAttachment): CodexUserInput {
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

export function conversationFromRuntime(runtime: CodexThreadRuntime): AgentConversation {
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

export function replaceItem(items: AgentItem[], item: AgentItem): AgentItem[] {
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

export function mergeCompletedTurn(current: AgentTurn | undefined, incoming: CodexTurn): AgentTurn {
  const normalized = normalizeTurn(incoming);
  if (!current) return normalized;
  const items = [...current.items];
  for (const item of normalized.items) {
    const next = replaceItem(items, item);
    items.splice(0, items.length, ...next);
  }
  return { ...current, ...normalized, items };
}

export function statusFromUnknown(value: unknown): AgentTurnStatus {
  return value === "completed" || value === "interrupted" || value === "failed"
    ? value
    : "inProgress";
}

export function requestFromRpc(
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

export type DeltaUpdate = {
  threadId: string;
  turnId: string;
  itemId: string;
  field: "text" | "aggregatedOutput" | "plan" | "reasoningSummary" | "reasoningContent";
  delta: string;
  partIndex?: number;
};

export function normalizeRateLimits(value: unknown): AgentRateLimits | null {
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

export function normalizeAccountUsage(value: unknown): AgentAccountUsage | null {
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
