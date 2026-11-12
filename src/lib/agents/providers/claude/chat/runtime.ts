import type { AgentChatState } from "@/lib/agents/chat-store";
import { saveModelCatalog } from "@/lib/agents/model-catalog";
import { conversationDiffPatch } from "@/lib/agents/thread-diff";
import { ClaudeClient, type ClaudeInitializeResult } from "@/lib/agents/providers/claude/client";
import type { AgentConversation, AgentItem, AgentModelOption, AgentThreadSummary } from "@/lib/agents/types";

import { isRecord, stringValue, arrayValue } from "@/lib/agents/chat/values";
import { claudeChatStore } from "@/lib/agents/providers/claude/chat-store";
import {
  MAX_CACHED_CONVERSATIONS,
  MAX_CAPABILITY_PATHS,
  STREAM_FLUSH_MS,
  type UnknownRecord,
  agentsByPath,
  capabilityLastUsedByPath,
  clientConnectPromises,
  clientLastUsed,
  clients,
  commandsByPath,
  conversationLastUsed,
  hooksByPath,
  mcpByPath,
  runtimeState,
  skillsByPath,
  streamEventsByThread,
} from "@/lib/agents/providers/claude/chat/state";
import { editChanges, questionSummaries, toolItem } from "@/lib/agents/providers/claude/chat/transcript";
import { loadCapabilities } from "@/lib/agents/providers/claude/chat/connect";

function touchCapabilityPath(path: string): void {
  capabilityLastUsedByPath.set(path, Date.now());
  if (capabilityLastUsedByPath.size <= MAX_CAPABILITY_PATHS) return;
  const oldest = [...capabilityLastUsedByPath.entries()]
    .filter(([candidate]) => candidate !== path)
    .sort((a, b) => a[1] - b[1])[0]?.[0];
  if (!oldest) return;
  capabilityLastUsedByPath.delete(oldest);
  skillsByPath.delete(oldest);
  hooksByPath.delete(oldest);
  commandsByPath.delete(oldest);
  agentsByPath.delete(oldest);
  mcpByPath.delete(oldest);
}

export function cacheConversation(
  state: Pick<AgentChatState, "conversations" | "visibleThreadId" | "requestsByThread">,
  threadId: string,
  conversation: AgentConversation,
): Record<string, AgentConversation> {
  conversationLastUsed.set(threadId, Date.now());
  const conversations = { ...state.conversations, [threadId]: conversation };
  const ids = Object.keys(conversations);
  if (ids.length <= MAX_CACHED_CONVERSATIONS) return conversations;
  const protectedIds = new Set([
    threadId,
    ...(state.visibleThreadId ? [state.visibleThreadId] : []),
    ...ids.filter((id) => conversations[id]?.activeTurnId || (state.requestsByThread[id]?.length ?? 0) > 0),
  ]);
  const candidates = ids
    .filter((id) => !protectedIds.has(id))
    .sort((a, b) => (conversationLastUsed.get(a) ?? 0) - (conversationLastUsed.get(b) ?? 0));
  let conversationCount = ids.length;
  while (conversationCount > MAX_CACHED_CONVERSATIONS && candidates.length) {
    const candidate = candidates.shift();
    if (!candidate) break;
    delete conversations[candidate];
    conversationLastUsed.delete(candidate);
    conversationCount -= 1;
  }
  return conversations;
}

export function closeIdleClients(keepVisible = false): void {
  const state = claudeChatStore.getState();
  const closedThreadIds: string[] = [];
  for (const [threadId, client] of clients) {
    if (keepVisible && threadId === state.visibleThreadId) continue;
    if (clientConnectPromises.has(threadId)) continue;
    if (state.conversations[threadId]?.activeTurnId || (state.requestsByThread[threadId]?.length ?? 0) > 0) continue;
    clients.delete(threadId);
    clientLastUsed.delete(threadId);
    clientConnectPromises.delete(threadId);
    closedThreadIds.push(threadId);
    void client.close().catch(() => {});
  }
  if (closedThreadIds.length) {
    claudeChatStore.setState((current) => {
      const sessionStatusByThread = { ...current.sessionStatusByThread };
      for (const threadId of closedThreadIds) sessionStatusByThread[threadId] = "idle";
      return { sessionStatusByThread };
    });
  }
}

export function emptyConversation(thread: AgentThreadSummary): AgentConversation {
  return {
    threadId: thread.id,
    path: thread.path,
    title: thread.title,
    model: "",
    reasoningEffort: null,
    collaborationMode: "default",
    approvalPolicy: claudeChatStore.getState().approvalPolicy,
    sandboxMode: claudeChatStore.getState().sandboxMode,
    turns: [],
    activeTurnId: null,
    loading: false,
    error: null,
  };
}

export function activeThreadClient(): ClaudeClient | undefined {
  const threadId = claudeChatStore.getState().visibleThreadId;
  return threadId ? clients.get(threadId) : undefined;
}

export function permissionMode(state = claudeChatStore.getState()): string {
  if (state.collaborationMode === "plan") return "plan";
  if (state.permissionProfile) return state.permissionProfile;
  if (state.sandboxMode === "danger-full-access" && state.approvalPolicy === "never") return "bypassPermissions";
  if (state.approvalPolicy === "never") return "dontAsk";
  if (state.sandboxMode === "workspace-write") return "acceptEdits";
  return "default";
}

/**
 * Switches the session out of plan mode after a plan was approved and pushes
 * the resulting permission mode to every live client.
 */
export function leavePlanMode(autoAcceptEdits: boolean, threadId?: string): void {
  const state = claudeChatStore.getState();
  if (state.collaborationMode !== "plan" && !autoAcceptEdits) return;
  claudeChatStore.setState({
    collaborationMode: "default",
    permissionProfile: null,
    sandboxMode: autoAcceptEdits ? "workspace-write" : state.sandboxMode,
    approvalPolicy: autoAcceptEdits && state.approvalPolicy === "untrusted"
      ? "on-request"
      : state.approvalPolicy,
  });
  const mode = permissionMode();
  const target = threadId ?? claudeChatStore.getState().visibleThreadId;
  const client = target ? clients.get(target) : undefined;
  void client?.setPermissionMode(mode).catch(() => {});
}

export function updateCapabilities(result: ClaudeInitializeResult, path: string) {
  touchCapabilityPath(path);
  const models: AgentModelOption[] = (result.models ?? []).map((model, index) => {
    const efforts = model.supportedEffortLevels?.length
      ? model.supportedEffortLevels
      : model.supportsEffort ? ["low", "medium", "high", "xhigh", "max"] : ["medium"];
    return {
      id: model.value,
      label: model.displayName ?? model.value,
      description: model.description ?? "Claude Code model",
      isDefault: index === 0,
      inputModalities: ["text", "image"],
      reasoningEfforts: efforts.map((value) => ({ value, label: value, description: `${value} thinking effort` })),
      defaultReasoningEffort: efforts.includes("high") ? "high" : efforts[0],
      serviceTiers: [],
      defaultServiceTier: null,
      supportsPersonality: false,
    };
  });
  const skills = (result.skills ?? []).flatMap((skill) => skill.name ? [{
    name: skill.name,
    description: skill.description ?? "",
    path: skill.path ?? "",
    enabled: true,
  }] : []);
  if (skills.length) skillsByPath.set(path, skills);
  if (result.commands?.length) commandsByPath.set(path, result.commands.map((command) => ({
    name: command.name,
    description: command.description ?? "",
    argumentHint: command.argumentHint ?? "",
  })));
  if (result.agents?.length) agentsByPath.set(path, result.agents.flatMap((agent) => agent.name ? [{
    name: agent.name,
    description: agent.description ?? "",
  }] : []));
  if (result.mcpServers?.length) mcpByPath.set(path, result.mcpServers.filter(isRecord).map((server) => ({
    name: stringValue(server.name),
    tools: arrayValue(server.tools).map((tool) => isRecord(tool) ? stringValue(tool.name) : String(tool)).filter(Boolean),
    authStatus: stringValue(server.status, "unknown"),
  })));
  if (models.length) saveModelCatalog("claude", models);
  claudeChatStore.setState((state) => ({
    models: models.length ? models : state.models,
    defaultModel: models[0]?.id ?? state.defaultModel,
    model: state.model && models.some((model) => model.id === state.model) ? state.model : (models[0]?.id ?? state.model),
    reasoningEffort: models
      .find((model) => model.id === (state.model && models.some((candidate) => candidate.id === state.model) ? state.model : models[0]?.id))
      ?.reasoningEfforts.some((effort) => effort.value === state.reasoningEffort)
        ? state.reasoningEffort
        : (models[0]?.defaultReasoningEffort ?? state.reasoningEffort),
    account: isRecord(result.account) ? {
      type: "claude.ai",
      email: stringValue(result.account.email) || null,
      planType: stringValue(result.account.subscriptionType) || null,
    } : state.account,
  }));
}

export async function claudeCapabilitySnapshot(path: string, force = false) {
  touchCapabilityPath(path);
  if (force) {
    skillsByPath.delete(path);
    hooksByPath.delete(path);
    commandsByPath.delete(path);
    agentsByPath.delete(path);
    mcpByPath.delete(path);
  }
  if (!skillsByPath.has(path) || !commandsByPath.has(path)) await loadCapabilities(path);
  return {
    skills: skillsByPath.get(path) ?? [],
    commands: commandsByPath.get(path) ?? [],
    agents: agentsByPath.get(path) ?? [],
    hooks: hooksByPath.get(path) ?? [],
    mcpServers: mcpByPath.get(path) ?? [],
  };
}

export function updateConversation(threadId: string, updater: (conversation: AgentConversation) => AgentConversation) {
  conversationLastUsed.set(threadId, Date.now());
  claudeChatStore.setState((state) => {
    const conversation = state.conversations[threadId];
    if (!conversation) return {};
    const next = updater(conversation);
    const threadsByPath = conversationDiffPatch(state.threadsByPath, next);
    return {
      conversations: { ...state.conversations, [threadId]: next },
      ...(threadsByPath ? { threadsByPath } : {}),
    };
  });
}

export function applyStreamEvents(
  conversation: AgentConversation,
  payloads: UnknownRecord[],
): AgentConversation {
  const activeId = conversation.activeTurnId;
  if (!activeId || payloads.length === 0) return conversation;
  const turnIndex = conversation.turns.findIndex((turn) => turn.id === activeId);
  if (turnIndex < 0) return conversation;

  const turn = conversation.turns[turnIndex];
  const items = [...turn.items];
  const itemIndexById = new Map(items.map((item, index) => [item.id, index]));
  let changed = false;

  for (const payload of payloads) {
    const event = isRecord(payload.event) ? payload.event : null;
    if (!event) continue;
    const index = typeof event.index === "number" ? event.index : 0;
    const streamId = `claude-stream-${index}`;
    const itemIndex = itemIndexById.get(streamId) ?? -1;

    if (event.type === "content_block_start" && isRecord(event.content_block)) {
      const block = event.content_block;
      const item: AgentItem = block.type === "text"
        ? { id: streamId, type: "agentMessage", text: stringValue(block.text), __claudeStream: true }
        : block.type === "thinking" || block.type === "redacted_thinking"
          ? {
              id: streamId,
              type: "reasoning",
              summary: [],
              content: [block.type === "redacted_thinking" ? "Geschützter Gedankengang" : stringValue(block.thinking)],
              redacted: block.type === "redacted_thinking",
              __claudeStream: true,
            }
          : block.type === "tool_use"
            ? { ...toolItem(block, streamId), __claudeStream: true }
            : { id: streamId, type: "dynamicToolCall", server: "Claude Code", tool: stringValue(block.type, "Tool"), arguments: block, status: "inProgress", __claudeStream: true };
      if (itemIndex >= 0) items[itemIndex] = item;
      else {
        itemIndexById.set(streamId, items.length);
        items.push(item);
      }
      changed = true;
      continue;
    }

    if (event.type === "content_block_delta" && isRecord(event.delta) && itemIndex >= 0) {
      const delta = event.delta;
      const item = items[itemIndex];
      if (delta.type === "text_delta") {
        items[itemIndex] = { ...item, text: `${stringValue(item.text)}${stringValue(delta.text)}` };
        changed = true;
      } else if (delta.type === "thinking_delta" && item.redacted !== true) {
        items[itemIndex] = { ...item, content: [`${arrayValue(item.content).join("")}${stringValue(delta.thinking)}`] };
        changed = true;
      } else if (delta.type === "input_json_delta") {
        items[itemIndex] = { ...item, partialJson: `${stringValue(item.partialJson)}${stringValue(delta.partial_json)}` };
        changed = true;
      }
      continue;
    }

    if (event.type === "content_block_stop" && itemIndex >= 0) {
      const item = items[itemIndex];
      let argumentsValue = item.arguments;
      let jsonParseError = false;
      if (typeof item.partialJson === "string" && item.partialJson.length > 0) {
        try {
          argumentsValue = JSON.parse(item.partialJson);
        } catch {
          jsonParseError = true;
        }
      }
      const parsedArguments = isRecord(argumentsValue) ? argumentsValue : null;
      items[itemIndex] = {
        ...item,
        arguments: argumentsValue,
        jsonParseError,
        changes: item.type === "fileChange" && parsedArguments
          ? editChanges(stringValue(item.tool), parsedArguments)
          : item.changes,
        plan: item.type === "planProposal" && parsedArguments
          ? stringValue(parsedArguments.plan)
          : item.plan,
        questions: item.type === "userQuestion" && parsedArguments
          ? questionSummaries(parsedArguments)
          : item.questions,
        __completed: true,
      };
      changed = true;
    }
  }

  if (!changed) return conversation;
  const turns = [...conversation.turns];
  turns[turnIndex] = { ...turn, items };
  return { ...conversation, turns };
}

export function flushStreamEvents(threadId?: string): void {
  const batches = threadId
    ? [[threadId, streamEventsByThread.get(threadId) ?? []] as const]
    : [...streamEventsByThread.entries()];
  for (const [id] of batches) streamEventsByThread.delete(id);
  if (streamEventsByThread.size === 0 && runtimeState.streamFlushTimer) {
    clearTimeout(runtimeState.streamFlushTimer);
    runtimeState.streamFlushTimer = null;
  }
  if (!batches.some(([, payloads]) => payloads.length > 0)) return;

  claudeChatStore.setState((state) => {
    let conversations = state.conversations;
    let changed = false;
    for (const [id, payloads] of batches) {
      const conversation = conversations[id];
      if (!conversation || payloads.length === 0) continue;
      const next = applyStreamEvents(conversation, payloads);
      if (next === conversation) continue;
      if (!changed) conversations = { ...conversations };
      conversations[id] = next;
      changed = true;
    }
    return changed ? { conversations } : {};
  });
}

function mergeStreamDelta(previous: UnknownRecord, next: UnknownRecord): UnknownRecord | null {
  const previousEvent = isRecord(previous.event) ? previous.event : null;
  const nextEvent = isRecord(next.event) ? next.event : null;
  if (
    previousEvent?.type !== "content_block_delta" ||
    nextEvent?.type !== "content_block_delta" ||
    previousEvent.index !== nextEvent.index
  ) return null;
  const previousDelta = isRecord(previousEvent.delta) ? previousEvent.delta : null;
  const nextDelta = isRecord(nextEvent.delta) ? nextEvent.delta : null;
  if (!previousDelta || !nextDelta || previousDelta.type !== nextDelta.type) return null;
  const field = previousDelta.type === "text_delta"
    ? "text"
    : previousDelta.type === "thinking_delta"
      ? "thinking"
      : previousDelta.type === "input_json_delta"
        ? "partial_json"
        : null;
  if (!field) return null;
  return {
    ...previous,
    event: {
      ...previousEvent,
      delta: {
        ...previousDelta,
        [field]: `${stringValue(previousDelta[field])}${stringValue(nextDelta[field])}`,
      },
    },
  };
}

export function scheduleStreamEvent(threadId: string, payload: UnknownRecord): void {
  const queued = streamEventsByThread.get(threadId);
  if (queued) {
    const lastIndex = queued.length - 1;
    const merged = lastIndex >= 0 ? mergeStreamDelta(queued[lastIndex], payload) : null;
    if (merged) queued[lastIndex] = merged;
    else queued.push(payload);
  } else streamEventsByThread.set(threadId, [payload]);
  if (runtimeState.streamFlushTimer) return;
  runtimeState.streamFlushTimer = setTimeout(() => {
    runtimeState.streamFlushTimer = null;
    flushStreamEvents();
  }, STREAM_FLUSH_MS);
}
