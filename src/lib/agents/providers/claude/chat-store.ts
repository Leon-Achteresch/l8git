import { BARCODE_TOOL } from "@/lib/agents/barcode-spec";
import { CHART_TOOL } from "@/lib/agents/chart-spec";
import { isRepoAgentsTrusted } from "@/lib/agent-trust-prefs";
import { callJiraTool } from "@/lib/jira/jira-runtime";
import { ensureJiraStatus, jiraThreadKey, jiraToolContextFor, useJiraStore } from "@/lib/jira/jira-store";
import { isJiraToolName, jiraToolsFor } from "@/lib/jira/jira-tools";
import { invoke } from "@/lib/platform/ipc";
import { kvGet, kvSet } from "@/lib/platform/kv";
import {
  CLAUDE_SESSION_PREFS_KEY as SESSION_PREFS_KEY,
  CLAUDE_SETTINGS_KEY,
} from "@/lib/agents/storage-keys";
import { createStore } from "zustand/vanilla";

import type { AgentChatState } from "@/lib/agents/chat-store";
import { loadModelCatalog, saveModelCatalog } from "@/lib/agents/model-catalog";
import { accumulateUsage } from "@/lib/agents/token-cost";
import { classifyTranscriptUserText } from "@/lib/agents/transcript-text";
import { ClaudeClient, type ClaudeControlRequest, type ClaudeInitializeResult } from "@/lib/agents/providers/claude/client";
import type {
  AgentAttachment,
  AgentConversation,
  AgentFileMatch,
  AgentHook,
  AgentItem,
  AgentMcpServer,
  AgentModelOption,
  AgentPendingRequest,
  AgentPlugin,
  AgentSkill,
  AgentThreadSummary,
  AgentTurn,
} from "@/lib/agents/types";

interface ClaudeSessionSummary {
  id: string;
  path: string;
  title: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  model?: string | null;
  permissionMode?: string | null;
}

interface ClaudeSessionTranscript {
  summary: ClaudeSessionSummary;
  entries: Array<Record<string, unknown>>;
}

type UnknownRecord = Record<string, unknown>;

const clients = new Map<string, ClaudeClient>();
const clientLastUsed = new Map<string, number>();
const clientConnectPromises = new Map<string, Promise<ClaudeClient>>();
const persistedSessions = new Set<string>();
const pendingForkSources = new Map<string, string>();
const skillsByPath = new Map<string, AgentSkill[]>();
const hooksByPath = new Map<string, AgentHook[]>();
const commandsByPath = new Map<string, Array<{ name: string; description: string; argumentHint: string }>>();
const agentsByPath = new Map<string, Array<{ name: string; description: string }>>();
const mcpByPath = new Map<string, AgentMcpServer[]>();
const capabilityLastUsedByPath = new Map<string, number>();
const capabilityPromises = new Map<string, Promise<void>>();
/* Repos whose model catalog we already tried to warm — see loadPermissionProfiles. */
const catalogWarmups = new Set<string>();
const transcriptPromises = new Map<string, Promise<ClaudeSessionTranscript>>();
const threadListPromises = new Map<string, Promise<ClaudeSessionSummary[]>>();
const threadListCache = new Map<string, { expiresAt: number; data: ClaudeSessionSummary[] }>();
const repoFileCache = new Map<string, {
  expiresAt: number;
  data: Array<{ path: string; lowerPath: string; fileName: string }>;
}>();
const repoFilePromises = new Map<string, Promise<Array<{ path: string; lowerPath: string; fileName: string }>>>();
const conversationLastUsed = new Map<string, number>();
let authPromise: Promise<void> | null = null;
let surfaceReferences = 0;
let surfaceReleaseTimer: ReturnType<typeof setTimeout> | null = null;
let sequence = 1;

const STREAM_FLUSH_MS = 100;
const THREAD_LIST_CACHE_MS = 10_000;
const REPO_FILE_CACHE_MS = 30_000;
const MAX_REPO_FILE_CACHES = 3;
const MAX_CAPABILITY_PATHS = 8;
const MAX_THREAD_LIST_CACHES = 8;
const MAX_WARM_CLIENTS = 2;
const MAX_CACHED_CONVERSATIONS = 6;
const streamEventsByThread = new Map<string, UnknownRecord[]>();
let streamFlushTimer: ReturnType<typeof setTimeout> | null = null;

const sessionPrefs: { pinned: Set<string>; archived: Set<string> } = (() => {
  try {
    const value = JSON.parse(kvGet(SESSION_PREFS_KEY) ?? "{}") as { pinned?: string[]; archived?: string[] };
    return { pinned: new Set(value.pinned ?? []), archived: new Set(value.archived ?? []) };
  } catch {
    return { pinned: new Set<string>(), archived: new Set<string>() };
  }
})();

function saveSessionPrefs() {
  kvSet(SESSION_PREFS_KEY, JSON.stringify({
    pinned: [...sessionPrefs.pinned],
    archived: [...sessionPrefs.archived],
  }));
}

const persistedSettings = (() => {
  try {
    const value = JSON.parse(kvGet(CLAUDE_SETTINGS_KEY) ?? "{}") as UnknownRecord;
    return {
      model: typeof value.model === "string" ? value.model : null,
      reasoningEffort: typeof value.reasoningEffort === "string" ? value.reasoningEffort : "high",
      collaborationMode: value.collaborationMode === "plan" ? "plan" as const : "default" as const,
      permissionProfile: typeof value.permissionProfile === "string" || value.permissionProfile === null ? value.permissionProfile : "default",
      approvalPolicy: value.approvalPolicy === "never" || value.approvalPolicy === "untrusted" ? value.approvalPolicy : "on-request" as const,
      sandboxMode: value.sandboxMode === "read-only" || value.sandboxMode === "danger-full-access" ? value.sandboxMode : "workspace-write" as const,
    };
  } catch {
    return {} as Partial<AgentChatState>;
  }
})();

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${sequence++}`;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

function sortThreads(threads: AgentThreadSummary[]): AgentThreadSummary[] {
  return [...threads].sort(
    (a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt,
  );
}

function cacheConversation(
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

function closeIdleClients(): void {
  const state = claudeChatStore.getState();
  const closedThreadIds: string[] = [];
  for (const [threadId, client] of clients) {
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

function summary(value: ClaudeSessionSummary): AgentThreadSummary {
  return {
    ...value,
    status: "idle",
    modelProvider: "anthropic",
  };
}

function emptyConversation(thread: AgentThreadSummary): AgentConversation {
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

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  return arrayValue(content)
    .filter(isRecord)
    .filter((block) => block.type === "text")
    .map((block) => stringValue(block.text))
    .filter(Boolean)
    .join("\n");
}

const FILE_EDIT_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"];

function replaceDiff(oldText: string, newText: string): string {
  const removed = oldText ? oldText.split("\n").map((line) => `-${line}`) : [];
  const added = newText ? newText.split("\n").map((line) => `+${line}`) : [];
  return [...removed, ...added].join("\n");
}

function editDiff(tool: string, input: UnknownRecord): string {
  if (tool === "Write") {
    const content = stringValue(input.content);
    const lines = content ? content.split("\n") : [];
    return [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join("\n");
  }
  if (tool === "MultiEdit") {
    return arrayValue(input.edits)
      .filter(isRecord)
      .map((edit) => replaceDiff(stringValue(edit.old_string), stringValue(edit.new_string)))
      .filter(Boolean)
      .join("\n");
  }
  if (tool === "NotebookEdit") {
    return replaceDiff(stringValue(input.old_source), stringValue(input.new_source));
  }
  return replaceDiff(stringValue(input.old_string), stringValue(input.new_string));
}

function editChanges(tool: string, input: UnknownRecord) {
  return [{
    path: stringValue(input.file_path, stringValue(input.notebook_path)),
    diff: editDiff(tool, input),
  }];
}

function patchDiff(patch: unknown): string {
  return arrayValue(patch)
    .filter(isRecord)
    .map((hunk) => [
      `@@ -${hunk.oldStart ?? 1},${hunk.oldLines ?? 0} +${hunk.newStart ?? 1},${hunk.newLines ?? 0} @@`,
      ...arrayValue(hunk.lines).map((line) => stringValue(line)),
    ].join("\n"))
    .join("\n");
}

/** Questions of an AskUserQuestion call, reduced to what the timeline shows. */
function questionSummaries(input: UnknownRecord) {
  return arrayValue(input.questions).filter(isRecord).map((question) => ({
    header: stringValue(question.header),
    question: stringValue(question.question),
    multiSelect: question.multiSelect === true,
    options: arrayValue(question.options).filter(isRecord).map((option) => ({
      label: stringValue(option.label),
      description: stringValue(option.description),
    })),
  }));
}

function toolItem(block: UnknownRecord, itemId: string): AgentItem {
  const name = stringValue(block.name, "Tool");
  const input = isRecord(block.input) ? block.input : {};
  if (FILE_EDIT_TOOLS.includes(name)) {
    return {
      id: itemId,
      type: "fileChange",
      tool: name,
      changes: editChanges(name, input),
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (name === "Bash") {
    return {
      id: itemId,
      type: "commandExecution",
      command: stringValue(input.command, name),
      cwd: stringValue(input.cwd),
      aggregatedOutput: "",
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (name === "WebSearch") {
    return {
      id: itemId,
      type: "webSearch",
      query: stringValue(input.query),
      results: [],
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (name === "TodoWrite") {
    return {
      id: itemId,
      type: "plan",
      plan: arrayValue(input.todos).map((todo) => isRecord(todo) ? {
        step: stringValue(todo.content, stringValue(todo.activeForm)),
        status: todo.status === "completed" ? "completed" : todo.status === "in_progress" ? "inProgress" : "pending",
      } : todo),
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (name === "ExitPlanMode") {
    return {
      id: itemId,
      type: "planProposal",
      plan: stringValue(input.plan),
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (name === "AskUserQuestion") {
    return {
      id: itemId,
      type: "userQuestion",
      questions: questionSummaries(input),
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  if (["Agent", "Task", "SendMessage", "TeamCreate"].includes(name)) {
    return {
      id: itemId,
      type: "collabAgentToolCall",
      tool: name,
      prompt: stringValue(input.prompt, stringValue(input.description)),
      arguments: input,
      status: "inProgress",
      toolUseId: block.id,
    };
  }
  return {
    id: itemId,
    type: "dynamicToolCall",
    server: name.startsWith("mcp__") ? name.split("__")[1] : "Claude Code",
    tool: name,
    arguments: input,
    status: "inProgress",
    toolUseId: block.id,
  };
}

function assistantItems(message: UnknownRecord, prefix: string): AgentItem[] {
  return arrayValue(message.content).flatMap((raw, index): AgentItem[] => {
    if (!isRecord(raw)) return [];
    const itemId = `${prefix}-${index}`;
    if (raw.type === "text") return [{ id: itemId, type: "agentMessage", text: stringValue(raw.text), __completed: true }];
    if (raw.type === "thinking" || raw.type === "redacted_thinking") {
      return [{
        id: itemId,
        type: "reasoning",
        summary: [stringValue(raw.thinking, raw.type === "redacted_thinking" ? "Geschützter Gedankengang" : "")],
        content: [],
        __completed: true,
      }];
    }
    if (raw.type === "tool_use") return [toolItem(raw, itemId)];
    return [];
  });
}

function applyToolResult(turn: AgentTurn, block: UnknownRecord, toolUseResult?: unknown): AgentTurn {
  const toolUseId = stringValue(block.tool_use_id);
  if (!toolUseId) return turn;
  const result = block.content;
  const patch = isRecord(toolUseResult) ? patchDiff(toolUseResult.structuredPatch) : "";
  return {
    ...turn,
    items: turn.items.map((item) => item.toolUseId === toolUseId ? {
      ...item,
      status: block.is_error === true ? "failed" : "completed",
      result,
      changes: item.type === "fileChange" && patch
        ? arrayValue(item.changes).filter(isRecord).map((change) => ({ ...change, diff: patch }))
        : item.changes,
      aggregatedOutput: item.type === "commandExecution" ? contentText(result) : item.aggregatedOutput,
      error: block.is_error === true ? contentText(result) : undefined,
      __completed: true,
    } : item),
  };
}

function transcriptConversation(transcript: ClaudeSessionTranscript): AgentConversation {
  const turns: AgentTurn[] = [];
  let current: AgentTurn | null = null;
  for (const [entryIndex, entry] of transcript.entries.entries()) {
    const message = isRecord(entry.message) ? entry.message : null;
    if (entry.type === "user" && message) {
      const blocks = arrayValue(message.content).filter(isRecord);
      const toolResults = blocks.filter((block) => block.type === "tool_result");
      if (toolResults.length && current) {
        for (const block of toolResults) current = applyToolResult(current, block, entry.toolUseResult);
        turns[turns.length - 1] = current;
        continue;
      }
      const classified = classifyTranscriptUserText(contentText(message.content));
      if (classified.kind === "skip") continue;
      // `/model` and friends log the invocation and its output as two entries
      // in a row; fold the second into the command item it belongs to.
      if (classified.kind === "commandOutput") {
        const previous: AgentItem | undefined = current?.items[current.items.length - 1];
        if (!current || previous?.type !== "localCommand" || previous.output) continue;
        current = {
          ...current,
          items: [...current.items.slice(0, -1), { ...previous, output: classified.output }],
        };
        turns[turns.length - 1] = current;
        continue;
      }
      const item: AgentItem = classified.kind === "command"
        // Slash commands are CLI scaffolding rather than a prompt, so they
        // render as a compact chip instead of a chat bubble.
        ? {
            id: stringValue(entry.uuid, `command-${entryIndex}`),
            type: "localCommand",
            command: classified.command,
            args: classified.args,
            output: classified.output,
          }
        : {
            id: stringValue(entry.uuid, `user-${entryIndex}`),
            type: "userMessage",
            content: [{ type: "text", text: classified.text }],
          };
      current = {
        id: stringValue(entry.promptId, stringValue(entry.uuid, `turn-${entryIndex}`)),
        items: [item],
        status: "completed",
        startedAt: Date.parse(stringValue(entry.timestamp)) || null,
      };
      turns.push(current);
      continue;
    }
    if (entry.type === "assistant" && message) {
      if (!current) {
        current = { id: `turn-${entryIndex}`, items: [], status: "completed" };
        turns.push(current);
      }
      const prefix = stringValue(entry.uuid, stringValue(message.id, `assistant-${entryIndex}`));
      current = { ...current, items: [...current.items, ...assistantItems(message, prefix)] };
      turns[turns.length - 1] = current;
    }
  }
  return {
    ...emptyConversation(summary(transcript.summary)),
    model: transcript.summary.model ?? "",
    turns,
  };
}

function permissionMode(state = claudeChatStore.getState()): string {
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
function leavePlanMode(autoAcceptEdits: boolean): void {
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
  for (const client of clients.values()) void client.setPermissionMode(mode).catch(() => {});
}

function updateCapabilities(result: ClaudeInitializeResult, path: string) {
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

function updateConversation(threadId: string, updater: (conversation: AgentConversation) => AgentConversation) {
  conversationLastUsed.set(threadId, Date.now());
  claudeChatStore.setState((state) => {
    const conversation = state.conversations[threadId];
    return conversation ? { conversations: { ...state.conversations, [threadId]: updater(conversation) } } : {};
  });
}

function applyStreamEvents(
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
          ? { id: streamId, type: "reasoning", summary: [], content: [stringValue(block.thinking)], __claudeStream: true }
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
      } else if (delta.type === "thinking_delta") {
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
      if (typeof item.partialJson === "string") {
        try { argumentsValue = JSON.parse(item.partialJson); } catch { /* final assistant frame supplies canonical input */ }
      }
      // A streamed tool_use starts with an empty input, so the fields derived
      // from it have to be rebuilt once the arguments finished arriving.
      const parsedArguments = isRecord(argumentsValue) ? argumentsValue : null;
      items[itemIndex] = {
        ...item,
        arguments: argumentsValue,
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

function flushStreamEvents(threadId?: string): void {
  const batches = threadId
    ? [[threadId, streamEventsByThread.get(threadId) ?? []] as const]
    : [...streamEventsByThread.entries()];
  for (const [id] of batches) streamEventsByThread.delete(id);
  if (streamEventsByThread.size === 0 && streamFlushTimer) {
    clearTimeout(streamFlushTimer);
    streamFlushTimer = null;
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

function scheduleStreamEvent(threadId: string, payload: UnknownRecord): void {
  const queued = streamEventsByThread.get(threadId);
  if (queued) {
    const lastIndex = queued.length - 1;
    const merged = lastIndex >= 0 ? mergeStreamDelta(queued[lastIndex], payload) : null;
    if (merged) queued[lastIndex] = merged;
    else queued.push(payload);
  } else streamEventsByThread.set(threadId, [payload]);
  if (streamFlushTimer) return;
  streamFlushTimer = setTimeout(() => {
    streamFlushTimer = null;
    flushStreamEvents();
  }, STREAM_FLUSH_MS);
}

function handleClaudeMessage(threadId: string, path: string, event: UnknownRecord) {
  if (event.type === "stream_event") {
    scheduleStreamEvent(threadId, event);
    return;
  }
  // Canonical assistant/result frames must observe all queued partial deltas;
  // otherwise a delayed batch could resurrect a stale streaming item.
  flushStreamEvents(threadId);
  if (event.type === "system" && event.subtype === "init") {
    updateCapabilities(event as ClaudeInitializeResult, path);
    const skills = arrayValue(event.skills).flatMap((skill) => typeof skill === "string" ? [{
      name: skill,
      description: "Claude Code skill",
      path: "",
      enabled: true,
    }] : []);
    if (skills.length) skillsByPath.set(path, skills);
    const mcpServers = arrayValue(event.mcp_servers).filter(isRecord).map((server): AgentMcpServer => ({
      name: stringValue(server.name),
      tools: arrayValue(server.tools).map((tool) => isRecord(tool) ? stringValue(tool.name) : String(tool)).filter(Boolean),
      authStatus: stringValue(server.status, "unknown"),
    }));
    if (mcpServers.length) mcpByPath.set(path, mcpServers);
    return;
  }
  if (event.type === "assistant" && isRecord(event.message)) {
    const message = event.message;
    const prefix = stringValue(event.uuid, stringValue(message.id, id("assistant")));
    updateConversation(threadId, (conversation) => {
      const activeId = conversation.activeTurnId ?? id("turn");
      const turns = [...conversation.turns];
      let index = turns.findIndex((turn) => turn.id === activeId);
      if (index < 0) {
        turns.push({ id: activeId, items: [], status: "inProgress", startedAt: Date.now() });
        index = turns.length - 1;
      }
      const existing = turns[index];
      const incoming = assistantItems(message, prefix);
      const incomingIds = new Set(incoming.map((item) => item.id));
      turns[index] = {
        ...existing,
        items: [...existing.items.filter((item) => item.__claudeStream !== true && !incomingIds.has(item.id)), ...incoming],
      };
      return { ...conversation, model: stringValue(message.model, conversation.model), turns, activeTurnId: activeId };
    });
    return;
  }
  if (event.type === "user" && isRecord(event.message)) {
    const results = arrayValue(event.message.content).filter(isRecord).filter((block) => block.type === "tool_result");
    if (!results.length) {
      updateConversation(threadId, (conversation) => {
        let delivered = false;
        return {
          ...conversation,
          turns: conversation.turns.map((turn) => ({
            ...turn,
            items: turn.items.map((item) => {
              if (delivered || item.__queued !== true) return item;
              delivered = true;
              const { __queued, ...rest } = item;
              return rest;
            }),
          })),
        };
      });
      return;
    }
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      turns: conversation.turns.map((turn) => {
        let next = turn;
        for (const result of results) next = applyToolResult(next, result, event.toolUseResult);
        return next;
      }),
    }));
    return;
  }
  if (event.type === "result") {
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      activeTurnId: null,
      error: event.is_error === true ? stringValue(event.result, "Claude Code turn failed.") : null,
      tokenUsage: isRecord(event.usage)
        ? accumulateUsage(conversation.tokenUsage, {
            inputTokens: Number(event.usage.input_tokens ?? 0),
            outputTokens: Number(event.usage.output_tokens ?? 0),
            cacheReadTokens: Number(event.usage.cache_read_input_tokens ?? 0),
            cacheWriteTokens: Number(event.usage.cache_creation_input_tokens ?? 0),
          })
        : conversation.tokenUsage,
      turns: conversation.turns.map((turn) => turn.id === conversation.activeTurnId ? {
        ...turn,
        status: event.is_error === true || stringValue(event.subtype).startsWith("error") ? "failed" : "completed",
        completedAt: Date.now(),
        error: event.is_error === true || stringValue(event.subtype).startsWith("error")
          ? stringValue(event.result, arrayValue(event.errors).map(String).join("; "))
          : null,
      } : turn),
    }));
    claudeChatStore.setState((state) => ({
      sessionStatusByThread: { ...state.sessionStatusByThread, [threadId]: "ready" },
    }));
    if (surfaceReferences === 0) {
      if (surfaceReleaseTimer) clearTimeout(surfaceReleaseTimer);
      surfaceReleaseTimer = setTimeout(() => {
        surfaceReleaseTimer = null;
        if (surfaceReferences === 0) closeIdleClients();
      }, 1_000);
    }
    return;
  }
  if (event.type === "tool_progress") {
    const toolUseId = stringValue(event.tool_use_id);
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      turns: conversation.turns.map((turn) => ({
        ...turn,
        items: turn.items.map((item) => item.toolUseId === toolUseId ? {
          ...item,
          progress: [...arrayValue(item.progress), stringValue(event.tool_name, "Tool running")],
        } : item),
      })),
    }));
  }
  if (event.type === "task_started" || event.type === "task_progress" || event.type === "task_updated") {
    updateConversation(threadId, (conversation) => {
      const activeId = conversation.activeTurnId;
      const taskId = stringValue(event.task_id, id("task"));
      const taskItem: AgentItem = {
        id: taskId,
        type: "collabAgentToolCall",
        tool: stringValue(event.type),
        prompt: stringValue(event.description, stringValue(event.summary)),
        status: event.status === "completed" ? "completed" : "inProgress",
      };
      const turns = conversation.turns.map((turn) => turn.id === activeId ? {
        ...turn,
        items: [...turn.items.filter((item) => item.id !== taskId), taskItem],
      } : turn);
      return { ...conversation, turns };
    });
  }
  if (event.type === "status" && event.status === "compacting") {
    updateConversation(threadId, (conversation) => {
      const turns = [...conversation.turns];
      const index = turns.findIndex((turn) => turn.id === conversation.activeTurnId);
      if (index >= 0) turns[index] = { ...turns[index], items: [...turns[index].items, { id: id("compact"), type: "contextCompaction" }] };
      return { ...conversation, turns };
    });
  }
  if (event.type === "hook_started" || event.type === "hook_response") {
    const hookName = stringValue(event.hook_name, stringValue(event.hook_event, "Hook"));
    const current = hooksByPath.get(path) ?? [];
    if (!current.some((hook) => hook.key === hookName)) {
      hooksByPath.set(path, [...current, { key: hookName, eventName: hookName, enabled: true, trustStatus: "runtime" }]);
    }
  }
}

/** Bestätigung für den In-App-MCP-Server; gerendert wird in der UI. */
function renderedToolAck(toolName: string): string {
  if (toolName === BARCODE_TOOL.name) return "Barcode wurde in der l8git-UI gerendert.";
  if (toolName === CHART_TOOL.name) return "Diagramm wurde in der l8git-UI gerendert.";
  return "Ausgabe wurde in der l8git-UI gerendert.";
}

/**
 * In-process MCP server ("l8git", declared in `agent_transport.rs`). The tool
 * list is rebuilt per request so gated tools — currently Jira — only cost
 * context tokens while they are actually usable.
 */
async function handleMcpMessage(
  threadId: string,
  requestId: string,
  message: Record<string, unknown>,
) {
  const method = stringValue(message.method);
  const respond = (result: unknown) =>
    clients.get(threadId)?.respond(requestId, {
      mcp_response: { jsonrpc: "2.0", id: message.id, result },
    });
  try {
    if (method === "initialize") {
      await respond({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "l8git", version: "1.0.0" },
      });
      return;
    }
    if (method === "tools/list") {
      await respond({ tools: [CHART_TOOL, BARCODE_TOOL, ...(await gatedJiraTools(threadId))] });
      return;
    }
    if (method === "tools/call") {
      const params = isRecord(message.params) ? message.params : {};
      // MCP sends the bare name, but Claude Code also knows these tools as
      // `mcp__l8git__<name>`; accept both rather than fall through to the
      // chart reply and leave the agent thinking Jira is broken.
      const toolName = stringValue(params.name).replace(/^mcp__l8git__/, "");
      if (isJiraToolName(toolName)) {
        if (useJiraStore.getState().enabled) await ensureJiraStatus();
        const args = isRecord(params.arguments) ? params.arguments : {};
        const context = jiraToolContextFor(jiraThreadKey("claude", threadId));
        await respond(await callJiraTool(toolName, args, context));
        return;
      }
      await respond({ content: [{ type: "text", text: renderedToolAck(toolName) }] });
      return;
    }
    await clients.get(threadId)?.respond(requestId, {
      mcp_response: {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: `Unbekannte Methode: ${method}` },
      },
    });
  } catch (error) {
    try {
      await clients.get(threadId)?.respond(requestId, {
        mcp_response: {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
        },
      });
    } catch {
      // The transport is already gone; nothing left to answer.
    }
  }
}

async function gatedJiraTools(threadId: string) {
  // Skipping the keychain probe while the feature is off keeps `tools/list`
  // free of both latency and tokens.
  if (!useJiraStore.getState().enabled) return [];
  await ensureJiraStatus();
  return jiraToolsFor(jiraToolContextFor(jiraThreadKey("claude", threadId)));
}

function handleControlRequest(threadId: string, request: ClaudeControlRequest) {
  const subtype = stringValue(request.request.subtype);
  if (subtype === "oauth_token_refresh") {
    void clients.get(threadId)?.respond(request.request_id, { accessToken: null });
    return;
  }
  if (subtype === "elicitation") {
    const pending: AgentPendingRequest = {
      sessionId: threadId,
      requestId: request.request_id,
      method: "claude/elicitation",
      kind: "elicitation",
      threadId,
      reason: stringValue(request.request.description, stringValue(request.request.message)),
      raw: {
        ...request.request,
        serverName: request.request.mcp_server_name,
        requestedSchema: request.request.requested_schema,
      },
    };
    claudeChatStore.setState((state) => ({
      requestsByThread: {
        ...state.requestsByThread,
        [threadId]: [
          ...(state.requestsByThread[threadId] ?? []).filter((item) => item.requestId !== pending.requestId),
          pending,
        ],
      },
    }));
    return;
  }
  if (subtype === "mcp_message") {
    const message = isRecord(request.request.message) ? request.request.message : {};
    if (message.id === undefined || message.id === null) {
      void clients.get(threadId)?.respond(request.request_id, {});
      return;
    }
    void handleMcpMessage(threadId, request.request_id, message);
    return;
  }
  if (subtype !== "can_use_tool") {
    void clients.get(threadId)?.respondError(request.request_id, `Unsupported Claude control request: ${subtype}`);
    return;
  }
  const input = isRecord(request.request.input) ? request.request.input : {};
  const tool = stringValue(request.request.tool_name, "Tool");
  const isQuestion = tool === "AskUserQuestion";
  // Leaving plan mode is a decision about the plan itself, not a command
  // approval, so it gets its own request kind and card.
  const isPlan = tool === "ExitPlanMode";
  const questions = isQuestion ? arrayValue(input.questions).filter(isRecord).map((question, index) => ({
    id: `q-${index}`,
    header: stringValue(question.header, "Question"),
    question: stringValue(question.question),
    isOther: true,
    multiSelect: question.multiSelect === true,
    options: arrayValue(question.options).filter(isRecord).map((option) => ({
      label: stringValue(option.label),
      description: stringValue(option.description),
    })),
  })) : undefined;
  const pending: AgentPendingRequest = {
    sessionId: threadId,
    requestId: request.request_id,
    method: "claude/canUseTool",
    kind: isQuestion
      ? "user-input"
      : isPlan
        ? "plan"
        : ["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)
          ? "file-change"
          : "command",
    threadId,
    itemId: stringValue(request.request.tool_use_id) || undefined,
    reason: stringValue(request.request.decision_reason, stringValue(request.request.description)),
    command: tool === "Bash" ? stringValue(input.command) : tool,
    cwd: stringValue(input.cwd) || undefined,
    questions,
    plan: isPlan ? stringValue(input.plan) : undefined,
    raw: request.request,
  };
  claudeChatStore.setState((state) => ({
    requestsByThread: {
      ...state.requestsByThread,
      [threadId]: [
        ...(state.requestsByThread[threadId] ?? []).filter((item) => item.requestId !== pending.requestId),
        pending,
      ],
    },
  }));
}

async function connectClient(
  path: string,
  threadId: string,
  resume?: boolean,
  forkSession?: boolean,
  resumeSessionId?: string,
): Promise<ClaudeClient> {
  const existing = clients.get(threadId);
  if (existing) {
    clientLastUsed.set(threadId, Date.now());
    return existing;
  }
  claudeChatStore.setState((state) => ({
    sessionStatusByThread: { ...state.sessionStatusByThread, [threadId]: "connecting" },
  }));
  const client = new ClaudeClient(threadId, {
    onMessage: (message) => handleClaudeMessage(threadId, path, message),
    onControlRequest: (request) => handleControlRequest(threadId, request),
    onControlCancel: (requestId) => removeRequest(threadId, requestId),
    onDiagnostic: (line) => claudeChatStore.setState((state) => ({ diagnostics: [...state.diagnostics.slice(-99), line] })),
    onExit: (code) => {
      clients.delete(threadId);
      clientLastUsed.delete(threadId);
      claudeChatStore.setState((state) => ({
        sessionStatusByThread: { ...state.sessionStatusByThread, [threadId]: code === 0 ? "idle" : "error" },
      }));
    },
  });
  clients.set(threadId, client);
  clientLastUsed.set(threadId, Date.now());
  try {
    const state = claudeChatStore.getState();
    const pendingForkSource = pendingForkSources.get(threadId);
    const shouldResume = resume ?? (persistedSessions.has(threadId) || Boolean(pendingForkSource));
    const shouldFork = forkSession ?? Boolean(pendingForkSource);
    const sourceSessionId = resumeSessionId ?? pendingForkSource ?? threadId;
    const initialized = await client.connect({
      cwd: path,
      resume: shouldResume,
      resumeSessionId: shouldResume ? sourceSessionId : undefined,
      forkSession: shouldFork,
      persistSession: true,
      model: state.model ?? undefined,
      effort: state.reasoningEffort,
      permissionMode: permissionMode(state),
      agentsTrusted: isRepoAgentsTrusted(path),
    });
    updateCapabilities(initialized, path);
    claudeChatStore.setState((current) => ({
      sessionStatusByThread: { ...current.sessionStatusByThread, [threadId]: "ready" },
    }));
    const currentState = claudeChatStore.getState();
    const idleCandidates = [...clients.keys()]
      .filter((candidate) => candidate !== threadId &&
        !currentState.conversations[candidate]?.activeTurnId &&
        (currentState.requestsByThread[candidate]?.length ?? 0) === 0)
      .sort((a, b) => (clientLastUsed.get(a) ?? 0) - (clientLastUsed.get(b) ?? 0));
    const evictedThreadIds: string[] = [];
    while (clients.size > MAX_WARM_CLIENTS && idleCandidates.length) {
      const candidate = idleCandidates.shift()!;
      const idle = clients.get(candidate);
      clients.delete(candidate);
      clientLastUsed.delete(candidate);
      evictedThreadIds.push(candidate);
      await idle?.close().catch(() => {});
    }
    if (evictedThreadIds.length) {
      claudeChatStore.setState((current) => {
        const sessionStatusByThread = { ...current.sessionStatusByThread };
        for (const evictedThreadId of evictedThreadIds) sessionStatusByThread[evictedThreadId] = "idle";
        return { sessionStatusByThread };
      });
    }
    return client;
  } catch (error) {
    clients.delete(threadId);
    clientLastUsed.delete(threadId);
    claudeChatStore.setState((state) => ({
      sessionStatusByThread: { ...state.sessionStatusByThread, [threadId]: "error" },
    }));
    throw error;
  }
}

function ensureClient(
  path: string,
  threadId: string,
  resume?: boolean,
  forkSession?: boolean,
  resumeSessionId?: string,
): Promise<ClaudeClient> {
  const pending = clientConnectPromises.get(threadId);
  if (pending) return pending;
  const promise = connectClient(path, threadId, resume, forkSession, resumeSessionId);
  clientConnectPromises.set(threadId, promise);
  void promise.finally(() => {
    if (clientConnectPromises.get(threadId) === promise) clientConnectPromises.delete(threadId);
  }).catch(() => {});
  return promise;
}

async function loadCapabilities(path: string) {
  const pending = capabilityPromises.get(path);
  if (pending) return pending;
  const promise = (async () => {
    const sessionId = crypto.randomUUID();
    const client = new ClaudeClient(sessionId, {
      onMessage: (message) => handleClaudeMessage(sessionId, path, message),
      onControlRequest: () => {},
    });
    try {
      const initialized = await client.connect({ cwd: path, persistSession: false, permissionMode: permissionMode() });
      updateCapabilities(initialized, path);
      const [skills, hooks, mcpResponse] = await Promise.all([
        invoke<AgentSkill[]>("claude_list_skills", { path }).catch(() => []),
        invoke<AgentHook[]>("claude_list_hooks", { path }).catch(() => []),
        client.request("mcp_status").catch(() => null),
      ]);
      if (skills.length) skillsByPath.set(path, skills);
      if (hooks.length) hooksByPath.set(path, hooks);
      const mcpServers = isRecord(mcpResponse) && Array.isArray(mcpResponse.mcpServers)
        ? mcpResponse.mcpServers.filter(isRecord).map((server): AgentMcpServer => ({
            name: stringValue(server.name),
            tools: arrayValue(server.tools).map((tool) => isRecord(tool) ? stringValue(tool.name) : String(tool)).filter(Boolean),
            authStatus: stringValue(server.status, "unknown"),
          }))
        : [];
      if (mcpServers.length) mcpByPath.set(path, mcpServers);
    } finally {
      await client.close().catch(() => {});
    }
  })();
  capabilityPromises.set(path, promise);
  try {
    await promise;
  } finally {
    if (capabilityPromises.get(path) === promise) capabilityPromises.delete(path);
  }
}

export async function warmClaudeModelCatalog(path: string): Promise<void> {
  if (!path || catalogWarmups.has(path)) return;
  catalogWarmups.add(path);
  await loadCapabilities(path).catch(() => catalogWarmups.delete(path));
}

function loadSessionList(paths: string[]): Promise<ClaudeSessionSummary[]> {
  const unique = [...new Set(paths.filter(Boolean))].sort();
  const key = unique.join("\u0000");
  const cached = threadListCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  const pending = threadListPromises.get(key);
  if (pending) return pending;
  const promise = invoke<ClaudeSessionSummary[]>("claude_list_sessions", { paths: unique })
    .then((data) => {
      if (threadListCache.size >= MAX_THREAD_LIST_CACHES && !threadListCache.has(key)) {
        const oldest = threadListCache.keys().next().value;
        if (oldest) threadListCache.delete(oldest);
      }
      threadListCache.set(key, { expiresAt: Date.now() + THREAD_LIST_CACHE_MS, data });
      return data;
    });
  threadListPromises.set(key, promise);
  void promise.finally(() => {
    if (threadListPromises.get(key) === promise) threadListPromises.delete(key);
  }).catch(() => {});
  return promise;
}

function loadTranscript(path: string, threadId: string): Promise<ClaudeSessionTranscript> {
  const key = `${path}\u0000${threadId}`;
  const pending = transcriptPromises.get(key);
  if (pending) return pending;
  const promise = invoke<ClaudeSessionTranscript>("claude_read_session", {
    path,
    sessionId: threadId,
  });
  transcriptPromises.set(key, promise);
  void promise.finally(() => {
    if (transcriptPromises.get(key) === promise) transcriptPromises.delete(key);
  }).catch(() => {});
  return promise;
}

function loadRepoFiles(path: string): Promise<Array<{ path: string; lowerPath: string; fileName: string }>> {
  const cached = repoFileCache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    repoFileCache.delete(path);
    repoFileCache.set(path, cached);
    return Promise.resolve(cached.data);
  }
  const pending = repoFilePromises.get(path);
  if (pending) return pending;
  const promise = invoke<string[]>("repo_list_files", { path }).then((files) => {
    const data = files.map((file) => ({
      path: file,
      lowerPath: file.toLocaleLowerCase(),
      fileName: file.split(/[\\/]/u).pop() ?? file,
    }));
    if (repoFileCache.size >= MAX_REPO_FILE_CACHES) {
      const oldest = repoFileCache.keys().next().value;
      if (oldest) repoFileCache.delete(oldest);
    }
    repoFileCache.set(path, { expiresAt: Date.now() + REPO_FILE_CACHE_MS, data });
    return data;
  });
  repoFilePromises.set(path, promise);
  void promise.finally(() => {
    if (repoFilePromises.get(path) === promise) repoFilePromises.delete(path);
  }).catch(() => {});
  return promise;
}

function removeRequest(threadId: string, requestId: string | number) {
  claudeChatStore.setState((state) => ({
    requestsByThread: {
      ...state.requestsByThread,
      [threadId]: (state.requestsByThread[threadId] ?? []).filter((request) => request.requestId !== requestId),
    },
  }));
}

const permissionProfiles = [
  { id: "default", description: "Claude asks before sensitive actions.", allowed: true },
  { id: "acceptEdits", description: "Automatically accept file edits.", allowed: true },
  { id: "dontAsk", description: "Deny actions that are not pre-approved.", allowed: true },
  { id: "plan", description: "Read-only planning mode.", allowed: true },
  { id: "bypassPermissions", description: "Skip all permission checks.", allowed: true },
  { id: "auto", description: "Claude automatically chooses safe actions.", allowed: true },
];

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
    surfaceReferences += 1;
    if (surfaceReleaseTimer) clearTimeout(surfaceReleaseTimer);
    surfaceReleaseTimer = null;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      surfaceReferences = Math.max(0, surfaceReferences - 1);
      if (surfaceReferences > 0) return;
      surfaceReleaseTimer = setTimeout(() => {
        surfaceReleaseTimer = null;
        if (surfaceReferences === 0) closeIdleClients();
      }, 1_000);
    };
  },
  setVisibleThread: (visibleThreadId) => {
    if (visibleThreadId) conversationLastUsed.set(visibleThreadId, Date.now());
    set({ visibleThreadId });
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
    if (streamFlushTimer) clearTimeout(streamFlushTimer);
    streamFlushTimer = null;
    set({ account: null, requiresAuth: true });
  },
  loadThreads: async (paths) => {
    const unique = [...new Set(paths.filter(Boolean))];
    if (unique.length === 0) return;
    set((state) => ({ loadingPaths: { ...state.loadingPaths, ...Object.fromEntries(unique.map((path) => [path, true])) } }));
    try {
      const values = await loadSessionList(unique);
      values.forEach((thread) => persistedSessions.add(thread.id));
      const grouped: Record<string, AgentThreadSummary[]> = Object.fromEntries(
        unique.map((path) => [path, []]),
      );
      for (const thread of values) {
        if (!grouped[thread.path]) continue;
        grouped[thread.path].push({
          ...summary(thread),
          isPinned: sessionPrefs.pinned.has(thread.id),
          archived: sessionPrefs.archived.has(thread.id),
        });
      }
      for (const path of unique) grouped[path] = sortThreads(grouped[path]);
      set((state) => ({ threadsByPath: { ...state.threadsByPath, ...grouped } }));
    } finally {
      set((state) => ({ loadingPaths: { ...state.loadingPaths, ...Object.fromEntries(unique.map((path) => [path, false])) } }));
    }
  },
  createThread: async (path) => {
    const threadId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const thread: AgentThreadSummary = {
      id: threadId,
      path,
      title: "Neue Unterhaltung",
      preview: "",
      createdAt: now,
      updatedAt: now,
      status: "idle",
      modelProvider: "anthropic",
    };
    set((state) => ({
      threadsByPath: { ...state.threadsByPath, [path]: sortThreads([thread, ...(state.threadsByPath[path] ?? [])]) },
      conversations: cacheConversation(state, threadId, emptyConversation(thread)),
      activeThreadByPath: { ...state.activeThreadByPath, [path]: threadId },
    }));
    return threadId;
  },
  openThread: async (path, threadId) => {
    conversationLastUsed.set(threadId, Date.now());
    set((state) => ({ activeThreadByPath: { ...state.activeThreadByPath, [path]: threadId } }));
    if (!get().conversations[threadId]) {
      const transcript = await loadTranscript(path, threadId);
      set((state) => ({ conversations: cacheConversation(state, threadId, transcriptConversation(transcript)) }));
    }
  },
  sendMessage: async (path, text, attachments = []) => {
    let threadId = get().activeThreadByPath[path];
    if (!threadId) threadId = await get().createThread(path);
    const turnId = id("turn");
    const skillCommands = attachments.filter((attachment) => attachment.type === "skill").map((attachment) => `/${attachment.name}`);
    const fileMentions = attachments.filter((attachment) => attachment.type !== "skill").map((attachment) => `@${attachment.path}`);
    const prompt = [...skillCommands, text, ...fileMentions].filter(Boolean).join("\n\n");
    const itemContent = [
      { type: "text", text },
      ...attachments.map((attachment: AgentAttachment) => ({ type: attachment.type, path: attachment.path, name: attachment.name })),
    ];
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      activeTurnId: turnId,
      error: null,
      turns: [...conversation.turns, {
        id: turnId,
        items: [{ id: id("user"), type: "userMessage", content: itemContent }],
        status: "inProgress",
        startedAt: Date.now(),
      }],
    }));
    set((state) => ({
      threadsByPath: {
        ...state.threadsByPath,
        [path]: sortThreads((state.threadsByPath[path] ?? []).map((thread) => thread.id === threadId ? {
          ...thread,
          preview: thread.preview || text,
          title: thread.title === "Neue Unterhaltung" ? text.slice(0, 80) || thread.title : thread.title,
          updatedAt: Math.floor(Date.now() / 1000),
        } : thread)),
      },
    }));
    try {
      const client = await ensureClient(path, threadId);
      await client.sendPrompt(prompt);
    } catch (error) {
      updateConversation(threadId, (conversation) => ({
        ...conversation,
        activeTurnId: null,
        error: errorMessage(error),
        turns: conversation.turns.filter((turn) => turn.id !== turnId),
      }));
      throw error;
    }
    persistedSessions.add(threadId);
    pendingForkSources.delete(threadId);
  },
  steerMessage: async (threadId, text, attachments = []) => {
    const conversation = get().conversations[threadId];
    if (!conversation) throw new Error("Claude-Unterhaltung wurde nicht gefunden.");
    const client = await ensureClient(conversation.path, threadId);
    const skills = attachments.filter((attachment) => attachment.type === "skill").map((attachment) => `/${attachment.name}`);
    const files = attachments.filter((attachment) => attachment.type !== "skill").map((attachment) => `@${attachment.path}`);
    const queuedId = id("queued");
    updateConversation(threadId, (current) => ({
      ...current,
      turns: current.turns.map((turn) => turn.id === current.activeTurnId ? {
        ...turn,
        items: [...turn.items, {
          id: queuedId,
          type: "userMessage",
          content: [
            { type: "text", text },
            ...attachments.map((attachment) => ({ type: attachment.type, path: attachment.path, name: attachment.name })),
          ],
          __queued: true,
        }],
      } : turn),
    }));
    try {
      await client.sendPrompt([...skills, text, ...files].filter(Boolean).join("\n\n"));
    } catch (error) {
      updateConversation(threadId, (current) => ({
        ...current,
        turns: current.turns.map((turn) => ({
          ...turn,
          items: turn.items.filter((item) => item.id !== queuedId),
        })),
      }));
      throw error;
    }
    persistedSessions.add(threadId);
    pendingForkSources.delete(threadId);
  },
  interrupt: async (threadId) => {
    await clients.get(threadId)?.interrupt();
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      activeTurnId: null,
      turns: conversation.turns.map((turn) => turn.id === conversation.activeTurnId ? { ...turn, status: "interrupted" } : turn),
    }));
  },
  respondToRequest: async (request, result) => {
    const client = clients.get(request.threadId);
    if (!client) throw new Error("Claude-Session ist nicht mehr aktiv.");
    const raw = request.raw;
    if (request.method === "claude/elicitation") {
      await client.respond(String(request.requestId), isRecord(result) ? result : { action: "decline" });
      removeRequest(request.threadId, request.requestId);
      return;
    }
    const input = isRecord(raw.input) ? raw.input : {};
    if (request.kind === "plan") {
      const decision = isRecord(result) ? stringValue(result.decision) : "";
      if (decision === "decline") {
        const feedback = isRecord(result) ? stringValue(result.feedback).trim() : "";
        await client.respond(String(request.requestId), {
          behavior: "deny",
          message: feedback || "Plan noch nicht freigegeben. Bitte weiter planen.",
          interrupt: false,
        });
        removeRequest(request.threadId, request.requestId);
        return;
      }
      await client.respond(String(request.requestId), { behavior: "allow", updatedInput: input });
      // Approving a plan only takes effect once the session leaves plan mode —
      // otherwise Claude stays read-only and cannot execute what was approved.
      leavePlanMode(decision === "acceptEdits");
      removeRequest(request.threadId, request.requestId);
      return;
    }
    if (request.kind === "user-input") {
      const resultAnswers = isRecord(result) && isRecord(result.answers) ? result.answers : {};
      const answers: Record<string, string> = {};
      arrayValue(input.questions).filter(isRecord).forEach((question, index) => {
        const selected = isRecord(resultAnswers[`q-${index}`]) ? arrayValue((resultAnswers[`q-${index}`] as UnknownRecord).answers) : [];
        answers[stringValue(question.question)] = selected.map(String).join(", ");
      });
      await client.respond(String(request.requestId), { behavior: "allow", updatedInput: { ...input, answers } });
      // Keep the chosen answers on the question item so the transcript shows
      // what was decided instead of an opaque tool result.
      if (request.itemId) {
        updateConversation(request.threadId, (conversation) => ({
          ...conversation,
          turns: conversation.turns.map((turn) => ({
            ...turn,
            items: turn.items.map((item) =>
              item.type === "userQuestion" && item.toolUseId === request.itemId
                ? { ...item, answers }
                : item,
            ),
          })),
        }));
      }
    } else {
      const decision = isRecord(result) ? stringValue(result.decision) : "";
      if (decision === "decline" || decision === "rejected") {
        await client.respond(String(request.requestId), { behavior: "deny", message: "Rejected by user", interrupt: false });
      } else {
        const response: UnknownRecord = { behavior: "allow", updatedInput: input };
        if (decision === "acceptForSession" && Array.isArray(raw.permission_suggestions)) {
          response.updatedPermissions = raw.permission_suggestions;
        }
        await client.respond(String(request.requestId), response);
      }
    }
    removeRequest(request.threadId, request.requestId);
  },
  rejectUnsupportedRequest: async (request) => {
    const client = clients.get(request.threadId);
    await client?.respond(String(request.requestId), { behavior: "deny", message: "Unsupported request", interrupt: false });
    removeRequest(request.threadId, request.requestId);
  },
  archiveThread: async (path, threadId) => {
    sessionPrefs.archived.add(threadId);
    saveSessionPrefs();
    set((state) => ({
      threadsByPath: { ...state.threadsByPath, [path]: (state.threadsByPath[path] ?? []).map((thread) => thread.id === threadId ? { ...thread, archived: true } : thread) },
      activeThreadByPath: { ...state.activeThreadByPath, [path]: state.activeThreadByPath[path] === threadId ? null : state.activeThreadByPath[path] },
    }));
  },
  unarchiveThread: async (path, threadId) => {
    sessionPrefs.archived.delete(threadId);
    saveSessionPrefs();
    set((state) => ({
      threadsByPath: { ...state.threadsByPath, [path]: sortThreads((state.threadsByPath[path] ?? []).map((thread) => thread.id === threadId ? { ...thread, archived: false } : thread)) },
    }));
  },
  deleteThread: async (path, threadId) => {
    await clients.get(threadId)?.close().catch(() => {});
    clients.delete(threadId);
    clientLastUsed.delete(threadId);
    clientConnectPromises.delete(threadId);
    streamEventsByThread.delete(threadId);
    conversationLastUsed.delete(threadId);
    sessionPrefs.pinned.delete(threadId);
    sessionPrefs.archived.delete(threadId);
    pendingForkSources.delete(threadId);
    saveSessionPrefs();
    if (persistedSessions.has(threadId)) {
      await invoke("claude_delete_session", { path, sessionId: threadId });
      persistedSessions.delete(threadId);
    }
    set((state) => {
      const conversations = { ...state.conversations };
      delete conversations[threadId];
      return {
        conversations,
        threadsByPath: { ...state.threadsByPath, [path]: (state.threadsByPath[path] ?? []).filter((thread) => thread.id !== threadId) },
        activeThreadByPath: { ...state.activeThreadByPath, [path]: state.activeThreadByPath[path] === threadId ? null : state.activeThreadByPath[path] },
      };
    });
  },
  renameThread: async (path, threadId, name) => {
    const client = clients.get(threadId);
    if (client) await client.rename(name).catch(() => invoke("claude_rename_session", { path, sessionId: threadId, title: name }));
    else await invoke("claude_rename_session", { path, sessionId: threadId, title: name });
    set((state) => ({
      threadsByPath: { ...state.threadsByPath, [path]: (state.threadsByPath[path] ?? []).map((thread) => thread.id === threadId ? { ...thread, title: name } : thread) },
      conversations: state.conversations[threadId] ? { ...state.conversations, [threadId]: { ...state.conversations[threadId], title: name } } : state.conversations,
    }));
  },
  setThreadPinned: async (path, threadId, isPinned) => {
    if (isPinned) sessionPrefs.pinned.add(threadId);
    else sessionPrefs.pinned.delete(threadId);
    saveSessionPrefs();
    set((state) => ({
      threadsByPath: { ...state.threadsByPath, [path]: sortThreads((state.threadsByPath[path] ?? []).map((thread) => thread.id === threadId ? { ...thread, isPinned } : thread)) },
    }));
  },
  startReview: async (threadId, instructions) => {
    const conversation = get().conversations[threadId];
    if (!conversation) throw new Error("Claude-Unterhaltung wurde nicht gefunden.");
    await get().steerMessage(threadId, instructions ? `/review ${instructions}` : "/review");
  },
  compactThread: async (threadId) => {
    await get().steerMessage(threadId, "/compact");
  },
  forkThread: async (path, threadId) => {
    const forkId = crypto.randomUUID();
    const original = get().threadsByPath[path]?.find((thread) => thread.id === threadId);
    const now = Math.floor(Date.now() / 1000);
    const fork: AgentThreadSummary = {
      ...(original ?? { path, preview: "", createdAt: now, updatedAt: now, status: "idle", modelProvider: "anthropic" }),
      id: forkId,
      title: `${original?.title ?? "Unterhaltung"} (Fork)`,
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({
      threadsByPath: { ...state.threadsByPath, [path]: sortThreads([fork, ...(state.threadsByPath[path] ?? [])]) },
      conversations: state.conversations[threadId]
        ? cacheConversation(state, forkId, { ...state.conversations[threadId], threadId: forkId, title: fork.title, activeTurnId: null })
        : state.conversations,
      activeThreadByPath: { ...state.activeThreadByPath, [path]: forkId },
    }));
    pendingForkSources.set(forkId, threadId);
    await ensureClient(path, forkId, true, true, threadId);
    return forkId;
  },
  listSkills: async (path, forceReload) => {
    if (forceReload) skillsByPath.delete(path);
    if (!skillsByPath.has(path)) await loadCapabilities(path);
    return skillsByPath.get(path) ?? [];
  },
  loadPermissionProfiles: async (path) => {
    set({ permissionProfiles, permissionProfilesPath: path });
    await warmClaudeModelCatalog(path);
  },
  listApps: async () => [],
  listMcpServers: async (threadId) => {
    const target = threadId ? clients.get(threadId) : clients.values().next().value;
    if (!target) {
      const path = threadId
        ? get().conversations[threadId]?.path
        : Object.keys(get().threadsByPath)[0];
      if (!path) return [];
      if (!mcpByPath.has(path)) await loadCapabilities(path);
      return mcpByPath.get(path) ?? [];
    }
    const response = await target.request("mcp_status");
    const servers = isRecord(response) && Array.isArray(response.mcpServers) ? response.mcpServers : Array.isArray(response) ? response : [];
    return servers.filter(isRecord).map((server): AgentMcpServer => ({
      name: stringValue(server.name),
      tools: arrayValue(server.tools).map((tool) => isRecord(tool) ? stringValue(tool.name) : String(tool)).filter(Boolean),
      authStatus: stringValue(server.status, "unknown"),
    }));
  },
  loginMcpServer: async (name, threadId) => {
    const target = threadId ? clients.get(threadId) : clients.values().next().value;
    if (target) {
      const response = await target.request("mcp_authenticate", { serverName: name }).catch(() => null);
      if (isRecord(response)) {
        const url = stringValue(response.authUrl, stringValue(response.url));
        if (url) return url;
      }
    }
    const path = threadId ? get().conversations[threadId]?.path : Object.keys(get().threadsByPath)[0];
    if (!path) throw new Error("Kein Repository für die MCP-Anmeldung ausgewählt.");
    await invoke("claude_mcp_login", { path, name });
    return "";
  },
  searchFiles: async (path, query) => {
    const files = await loadRepoFiles(path);
    const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    return files
      .filter((file) => terms.every((term) => file.lowerPath.includes(term)))
      .slice(0, 200)
      .map((file, index): AgentFileMatch => ({
        root: path,
        path: file.path,
        fileName: file.fileName,
        score: 200 - index,
      }));
  },
  listHooks: async (path) => {
    const hooks = await invoke<AgentHook[]>("claude_list_hooks", { path }).catch(() => hooksByPath.get(path) ?? []);
    hooksByPath.set(path, hooks);
    return hooks;
  },
  listPlugins: async (path) => {
    const plugins = await invoke<UnknownRecord[]>("claude_list_plugins", { path });
    return plugins.map((plugin): AgentPlugin => ({
      id: stringValue(plugin.id),
      name: stringValue(plugin.id).split("@")[0],
      installed: true,
      enabled: plugin.enabled !== false,
      availability: stringValue(plugin.scope, "user"),
    }));
  },
  detectExternalAgentConfig: async () => [],
  listExternalAgentConfigImportHistories: async () => [],
  importExternalAgentConfig: async () => [],
  sendFeedback: async (reason, threadId) => {
    let client = threadId ? clients.get(threadId) : clients.values().next().value;
    if (!client && threadId) {
      const conversation = get().conversations[threadId];
      if (conversation) client = await ensureClient(conversation.path, threadId);
    }
    if (!client) throw new Error("Öffne zuerst eine aktive Claude-Unterhaltung.");
    const response = await client.submitFeedback(reason);
    return isRecord(response)
      ? stringValue(response.reportId, stringValue(response.id, "Claude Code"))
      : "Claude Code";
  },
  listBackgroundTerminals: async (threadId) => {
    const response = await clients.get(threadId)?.request("background_tasks");
    const tasks = isRecord(response) && Array.isArray(response.tasks) ? response.tasks : [];
    return tasks.filter(isRecord).map((task) => ({
      itemId: stringValue(task.id),
      processId: stringValue(task.id),
      command: stringValue(task.description, stringValue(task.command)),
      cwd: get().conversations[threadId]?.path ?? "",
      osPid: typeof task.pid === "number" ? task.pid : null,
      cpuPercent: null,
      rssKb: null,
    }));
  },
  stopBackgroundTerminals: async (threadId) => {
    const client = clients.get(threadId);
    const tasks = await get().listBackgroundTerminals(threadId);
    await Promise.all(tasks.map((task) => client?.request("stop_task", { task_id: task.processId })));
  },
  terminateBackgroundTerminal: async (threadId, processId) => {
    await clients.get(threadId)?.request("stop_task", { task_id: processId });
    return true;
  },
  setGoal: async (threadId, objective) => updateConversation(threadId, (conversation) => ({
    ...conversation,
    goal: { threadId, objective, status: "active", tokenBudget: null, tokensUsed: 0, timeUsedSeconds: 0 },
  })),
  clearGoal: async (threadId) => updateConversation(threadId, (conversation) => ({ ...conversation, goal: null })),
  setMemoryMode: async () => {},
  resetMemory: async () => {},
  setModel: (model) => {
    set({ model });
    for (const client of clients.values()) void client.setModel(model).catch(() => {});
  },
  setReasoningEffort: (reasoningEffort) => {
    set({ reasoningEffort });
    const tokens = ({ low: 2_048, medium: 8_192, high: 16_384, xhigh: 32_768, max: 64_000 } as Record<string, number>)[reasoningEffort] ?? 16_384;
    for (const client of clients.values()) void client.setMaxThinkingTokens(tokens).catch(() => {});
  },
  setServiceTier: (serviceTier) => set({ serviceTier }),
  setPersonality: (personality) => set({ personality }),
  setCollaborationMode: (collaborationMode) => {
    set({ collaborationMode, permissionProfile: collaborationMode === "plan" ? "plan" : get().permissionProfile === "plan" ? "default" : get().permissionProfile });
    for (const client of clients.values()) void client.setPermissionMode(permissionMode()).catch(() => {});
  },
  setPermissionProfile: (permissionProfile) => {
    set({ permissionProfile });
    for (const client of clients.values()) void client.setPermissionMode(permissionMode()).catch(() => {});
  },
  setRealtimeVoice: (realtimeVoice) => set({ realtimeVoice }),
  setApprovalPolicy: (approvalPolicy) => {
    set({ approvalPolicy, permissionProfile: null });
    for (const client of clients.values()) void client.setPermissionMode(permissionMode()).catch(() => {});
  },
  setSandboxMode: (sandboxMode) => {
    set({ sandboxMode, permissionProfile: null });
    for (const client of clients.values()) void client.setPermissionMode(permissionMode()).catch(() => {});
  },
  clearError: (threadId) => {
    if (!threadId) return set({ connectionError: null });
    updateConversation(threadId, (conversation) => ({ ...conversation, error: null }));
  },
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
