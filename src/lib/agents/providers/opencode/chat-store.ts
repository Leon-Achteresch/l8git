import { invoke } from "@tauri-apps/api/core";
import { createStore } from "zustand/vanilla";

import type { AgentChatState } from "@/lib/agents/chat-store";
import { loadModelCatalog, saveModelCatalog } from "@/lib/agents/model-catalog";
import { accumulateUsage } from "@/lib/agents/token-cost";
import {
  OpenCodeClient,
  openCodeCli,
  parseOpenCodeMcpServers,
  type OpenCodeConfigChoice,
  type OpenCodeConfigOption,
  type OpenCodeContentBlock,
  type OpenCodePermissionRequest,
  type OpenCodeSessionConfig,
} from "@/lib/agents/providers/opencode/client";
import type { RpcId } from "@/lib/agents/rpc-client";
import type {
  AgentAttachment,
  AgentConversation,
  AgentFileMatch,
  AgentItem,
  AgentMcpServer,
  AgentModelOption,
  AgentPendingRequest,
  AgentPermissionProfile,
  AgentSkill,
  AgentThreadSummary,
  AgentTurn,
} from "@/lib/agents/types";

type UnknownRecord = Record<string, unknown>;
type Command = { name: string; description: string; argumentHint: string };

const MODEL_CATEGORY = "model";
const MODE_CATEGORY = "mode";
const EFFORT_CATEGORY = "thought_level";
const STREAM_FLUSH_MS = 32;
const MAX_CACHED_CONVERSATIONS = 6;
const SETTINGS_KEY = "l8git.opencode-settings.v1";
const SESSION_PREFS_KEY = "l8git.opencode-session-state.v1";

const clients = new Map<string, OpenCodeClient>();
const clientPromises = new Map<string, Promise<OpenCodeClient>>();
const pathByThread = new Map<string, string>();
const commandsByPath = new Map<string, Command[]>();
const configByPath = new Map<string, OpenCodeConfigOption[]>();
const replayingThreads = new Set<string>();
const conversationLastUsed = new Map<string, number>();
const permissionOptionsByRequest = new Map<string, Array<{ optionId: string; kind: string }>>();
const repoFileCache = new Map<string, { expiresAt: number; data: Array<{ path: string; lowerPath: string; fileName: string }> }>();
const catalogWarmups = new Set<string>();
const updateQueue = new Map<string, UnknownRecord[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let surfaceReferences = 0;
let sequence = 1;

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

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${sequence++}`;
}

function epochSeconds(value: unknown): number {
  if (typeof value === "number") return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  const parsed = Date.parse(stringValue(value));
  return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) : Math.floor(parsed / 1000);
}

const sessionPrefs: { pinned: Set<string>; archived: Set<string> } = (() => {
  if (typeof window === "undefined") return { pinned: new Set<string>(), archived: new Set<string>() };
  try {
    const value = JSON.parse(window.localStorage.getItem(SESSION_PREFS_KEY) ?? "{}") as {
      pinned?: string[];
      archived?: string[];
    };
    return { pinned: new Set(value.pinned ?? []), archived: new Set(value.archived ?? []) };
  } catch {
    return { pinned: new Set<string>(), archived: new Set<string>() };
  }
})();

function saveSessionPrefs(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    SESSION_PREFS_KEY,
    JSON.stringify({ pinned: [...sessionPrefs.pinned], archived: [...sessionPrefs.archived] }),
  );
}

const persistedSettings = (() => {
  if (typeof window === "undefined") return {} as UnknownRecord;
  try {
    return JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}") as UnknownRecord;
  } catch {
    return {} as UnknownRecord;
  }
})();

function sortThreads(threads: AgentThreadSummary[]): AgentThreadSummary[] {
  return [...threads].sort(
    (a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt,
  );
}

function emptyConversation(thread: AgentThreadSummary): AgentConversation {
  const state = openCodeChatStore.getState();
  return {
    threadId: thread.id,
    path: thread.path,
    title: thread.title,
    model: state.model ?? "",
    reasoningEffort: state.reasoningEffort,
    collaborationMode: state.collaborationMode,
    approvalPolicy: state.approvalPolicy,
    sandboxMode: state.sandboxMode,
    turns: [],
    activeTurnId: null,
    loading: false,
    error: null,
  };
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
    ...ids.filter((key) => conversations[key]?.activeTurnId || (state.requestsByThread[key]?.length ?? 0) > 0),
  ]);
  const candidates = ids
    .filter((key) => !protectedIds.has(key))
    .sort((a, b) => (conversationLastUsed.get(a) ?? 0) - (conversationLastUsed.get(b) ?? 0));
  let count = ids.length;
  while (count > MAX_CACHED_CONVERSATIONS && candidates.length) {
    const candidate = candidates.shift();
    if (!candidate) break;
    delete conversations[candidate];
    conversationLastUsed.delete(candidate);
    count -= 1;
  }
  return conversations;
}

function updateConversation(
  threadId: string,
  updater: (conversation: AgentConversation) => AgentConversation,
): void {
  conversationLastUsed.set(threadId, Date.now());
  openCodeChatStore.setState((state) => {
    const conversation = state.conversations[threadId];
    return conversation
      ? { conversations: { ...state.conversations, [threadId]: updater(conversation) } }
      : {};
  });
}

function flatChoices(option: OpenCodeConfigOption): OpenCodeConfigChoice[] {
  return arrayValue(option.options).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    if (Array.isArray(entry.options)) return entry.options as OpenCodeConfigChoice[];
    return [entry as unknown as OpenCodeConfigChoice];
  });
}

function optionByCategory(
  options: OpenCodeConfigOption[],
  category: string,
): OpenCodeConfigOption | undefined {
  return options.find((option) => option.category === category || option.id === category);
}

/**
 * Turns the ACP `configOptions` payload into the catalog shape the shared chat
 * surface renders. opencode exposes every configured provider here, so the
 * model list is whatever the user has authenticated — not a hard-coded set.
 */
function catalogFromConfig(options: OpenCodeConfigOption[], config: OpenCodeSessionConfig) {
  const modelOption = optionByCategory(options, MODEL_CATEGORY);
  const effortOption = optionByCategory(options, EFFORT_CATEGORY);
  const modeOption = optionByCategory(options, MODE_CATEGORY);
  const efforts = effortOption
    ? flatChoices(effortOption).map((choice) => ({
        value: choice.value,
        label: choice.name,
        description: choice.description ?? "",
      }))
    : [];
  const defaultEffort = typeof effortOption?.currentValue === "string"
    ? effortOption.currentValue
    : efforts[0]?.value ?? "";
  const choices = modelOption
    ? flatChoices(modelOption)
    : (config.models?.availableModels ?? []).map((model) => ({
        value: model.modelId,
        name: model.name,
        description: model.description ?? null,
      }));
  const currentModel = typeof modelOption?.currentValue === "string"
    ? modelOption.currentValue
    : config.models?.currentModelId ?? null;
  const models: AgentModelOption[] = choices.map((choice) => ({
    id: choice.value,
    label: choice.name,
    description: choice.description ?? choice.value,
    isDefault: choice.value === currentModel,
    inputModalities: ["text", "image"],
    reasoningEfforts: efforts,
    defaultReasoningEffort: defaultEffort,
    serviceTiers: [],
    defaultServiceTier: null,
    supportsPersonality: false,
  }));
  const modeChoices = modeOption
    ? flatChoices(modeOption)
    : (config.modes?.availableModes ?? []).map((mode) => ({
        value: mode.id,
        name: mode.name,
        description: mode.description ?? null,
      }));
  const profiles: AgentPermissionProfile[] = modeChoices.map((choice) => ({
    id: choice.value,
    description: choice.description ?? choice.name,
    allowed: true,
  }));
  const currentMode = typeof modeOption?.currentValue === "string"
    ? modeOption.currentValue
    : config.modes?.currentModeId ?? null;
  return { models, currentModel, efforts, defaultEffort, profiles, currentMode };
}

function applyConfig(path: string, config: OpenCodeSessionConfig): void {
  const options = (config.configOptions ?? []) as OpenCodeConfigOption[];
  if (options.length) configByPath.set(path, options);
  const catalog = catalogFromConfig(options.length ? options : configByPath.get(path) ?? [], config);
  if (catalog.models.length) saveModelCatalog("opencode", catalog.models);
  openCodeChatStore.setState((state) => {
    const models = catalog.models.length ? catalog.models : state.models;
    const keepModel = state.model && models.some((model) => model.id === state.model);
    const model = keepModel ? state.model : catalog.currentModel ?? models[0]?.id ?? state.model;
    const efforts = catalog.efforts.length ? catalog.efforts : models[0]?.reasoningEfforts ?? [];
    const keepEffort = efforts.some((effort) => effort.value === state.reasoningEffort);
    return {
      models,
      defaultModel: catalog.currentModel ?? models[0]?.id ?? state.defaultModel,
      model,
      reasoningEffort: keepEffort ? state.reasoningEffort : catalog.defaultEffort || state.reasoningEffort,
      permissionProfiles: catalog.profiles.length ? catalog.profiles : state.permissionProfiles,
      permissionProfilesPath: path,
      permissionProfile: catalog.currentMode ?? state.permissionProfile,
      collaborationMode: catalog.currentMode === "plan" ? "plan" : "default",
      collaborationModes: (catalog.profiles.length ? catalog.profiles : state.permissionProfiles).map(
        (profile) => ({
          name: profile.id,
          mode: profile.id === "plan" ? ("plan" as const) : ("default" as const),
          model: null,
          reasoningEffort: null,
        }),
      ),
    };
  });
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!isRecord(content)) return "";
  if (content.type === "text") return stringValue(content.text);
  if (content.type === "content") return contentText(content.content);
  if (content.type === "resource" && isRecord(content.resource)) return stringValue(content.resource.text);
  return "";
}

function toolContentText(entries: unknown): string {
  return arrayValue(entries)
    .map((entry) => contentText(entry))
    .filter(Boolean)
    .join("\n");
}

function toolDiffs(entries: unknown): Array<{ path: string; diff: string }> {
  return arrayValue(entries).flatMap((entry) => {
    if (!isRecord(entry) || entry.type !== "diff") return [];
    const oldText = stringValue(entry.oldText);
    const newText = stringValue(entry.newText);
    return [{
      path: stringValue(entry.path),
      diff: unifiedDiff(oldText, newText),
    }];
  });
}

/**
 * ACP ships edits as before/after text, the chat surface renders unified diffs.
 * ponytail: whole-file replace hunk instead of an LCS diff — upgrade to a real
 * differ only if the rendered blocks get unwieldy.
 */
function unifiedDiff(oldText: string, newText: string): string {
  const removed = oldText ? oldText.split("\n").map((line) => `-${line}`) : [];
  const added = newText ? newText.split("\n").map((line) => `+${line}`) : [];
  return [`@@ -1,${removed.length} +1,${added.length} @@`, ...removed, ...added].join("\n");
}

function toolStatus(status: unknown): string {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "pending") return "pending";
  return "inProgress";
}

function toolItem(update: UnknownRecord, previous?: AgentItem): AgentItem {
  const toolCallId = stringValue(update.toolCallId);
  const kind = stringValue(update.kind, stringValue(previous?.__opencodeKind, "other"));
  const rawInput = isRecord(update.rawInput) ? update.rawInput : (previous?.arguments as UnknownRecord | undefined) ?? {};
  const title = stringValue(update.title, stringValue(previous?.title));
  const status = update.status === undefined ? stringValue(previous?.status, "inProgress") : toolStatus(update.status);
  const content = update.content ?? previous?.__opencodeContent;
  const base = {
    id: `tool-${toolCallId}`,
    toolUseId: toolCallId,
    title,
    status,
    arguments: rawInput,
    result: update.rawOutput ?? previous?.result,
    __opencodeKind: kind,
    __opencodeContent: content,
    __completed: status === "completed" || status === "failed",
  };
  if (kind === "execute") {
    return {
      ...base,
      type: "commandExecution",
      command: stringValue(rawInput.command, title || "Befehl"),
      cwd: stringValue(rawInput.cwd),
      aggregatedOutput: toolContentText(content),
    };
  }
  const diffs = toolDiffs(content);
  if (diffs.length) return { ...base, type: "fileChange", changes: diffs };
  return {
    ...base,
    type: "dynamicToolCall",
    server: "OpenCode",
    tool: title || kind,
    result: toolContentText(content) || base.result,
  };
}

function chunkItem(itemId: string, type: "agentMessage" | "userMessage" | "reasoning", text: string, previous?: AgentItem): AgentItem {
  if (type === "reasoning") {
    return {
      id: itemId,
      type: "reasoning",
      summary: [],
      content: [`${arrayValue(previous?.content).join("")}${text}`],
    };
  }
  if (type === "userMessage") {
    return { id: itemId, type: "userMessage", content: [{ type: "text", text }] };
  }
  return { id: itemId, type: "agentMessage", text: `${stringValue(previous?.text)}${text}` };
}

function withTurn(
  conversation: AgentConversation,
  mutate: (turn: AgentTurn) => AgentTurn,
  startNew = false,
): AgentConversation {
  const turns = [...conversation.turns];
  let activeTurnId = conversation.activeTurnId;
  let index = activeTurnId ? turns.findIndex((turn) => turn.id === activeTurnId) : -1;
  if (startNew || index < 0) {
    if (startNew && index >= 0) turns[index] = { ...turns[index], status: "completed" };
    activeTurnId = id("turn");
    turns.push({ id: activeTurnId, items: [], status: "inProgress", startedAt: Date.now() });
    index = turns.length - 1;
  }
  turns[index] = mutate(turns[index]);
  return { ...conversation, turns, activeTurnId };
}

function upsertItem(turn: AgentTurn, item: AgentItem): AgentTurn {
  const index = turn.items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) return { ...turn, items: [...turn.items, item] };
  const items = [...turn.items];
  items[index] = item;
  return { ...turn, items };
}

function findItem(conversation: AgentConversation, itemId: string): AgentItem | undefined {
  const turn = conversation.turns.find((candidate) => candidate.id === conversation.activeTurnId);
  return turn?.items.find((item) => item.id === itemId);
}

function applyUpdate(conversation: AgentConversation, update: UnknownRecord): AgentConversation {
  const kind = stringValue(update.sessionUpdate);
  if (kind === "agent_message_chunk" || kind === "agent_thought_chunk" || kind === "user_message_chunk") {
    const messageId = stringValue(update.messageId, "stream");
    const type = kind === "agent_message_chunk"
      ? "agentMessage"
      : kind === "agent_thought_chunk"
        ? "reasoning"
        : "userMessage";
    const itemId = `${type}-${messageId}`;
    const text = contentText(update.content);
    if (!text) return conversation;
    const startNew = kind === "user_message_chunk" && !findItem(conversation, itemId);
    return withTurn(
      conversation,
      (turn) => upsertItem(turn, chunkItem(itemId, type, text, turn.items.find((item) => item.id === itemId))),
      startNew,
    );
  }
  if (kind === "tool_call" || kind === "tool_call_update") {
    const itemId = `tool-${stringValue(update.toolCallId)}`;
    return withTurn(conversation, (turn) =>
      upsertItem(turn, toolItem(update, turn.items.find((item) => item.id === itemId))));
  }
  if (kind === "plan") {
    return withTurn(conversation, (turn) =>
      upsertItem(turn, {
        id: "plan",
        type: "plan",
        plan: arrayValue(update.entries).flatMap((entry) => isRecord(entry) ? [{
          step: stringValue(entry.content),
          status: entry.status === "completed"
            ? "completed"
            : entry.status === "in_progress"
              ? "inProgress"
              : "pending",
        }] : []),
        status: "inProgress",
      }));
  }
  if (kind === "usage_update") {
    return {
      ...conversation,
      tokenUsage: {
        ...(conversation.tokenUsage ?? { inputTokens: 0, outputTokens: 0 }),
        totalTokens: Number(update.used ?? 0),
        modelContextWindow: typeof update.size === "number" ? update.size : null,
      },
    };
  }
  if (kind === "session_info_update") {
    const title = stringValue(update.title);
    return title ? { ...conversation, title } : conversation;
  }
  return conversation;
}

function flushUpdates(): void {
  flushTimer = null;
  const batches = [...updateQueue.entries()];
  updateQueue.clear();
  if (!batches.length) return;
  openCodeChatStore.setState((state) => {
    let conversations = state.conversations;
    let changed = false;
    for (const [threadId, updates] of batches) {
      const conversation = conversations[threadId];
      if (!conversation) continue;
      let next = conversation;
      for (const update of updates) next = applyUpdate(next, update);
      if (next === conversation) continue;
      if (!changed) conversations = { ...conversations };
      conversations[threadId] = next;
      changed = true;
    }
    return changed ? { conversations } : {};
  });
}

function queueUpdate(threadId: string, update: UnknownRecord): void {
  const queued = updateQueue.get(threadId);
  if (queued) queued.push(update);
  else updateQueue.set(threadId, [update]);
  if (!flushTimer) flushTimer = setTimeout(flushUpdates, STREAM_FLUSH_MS);
}

function handleSessionUpdate(path: string, threadId: string, update: UnknownRecord): void {
  const kind = stringValue(update.sessionUpdate);
  if (kind === "available_commands_update") {
    commandsByPath.set(
      path,
      arrayValue(update.availableCommands).flatMap((command) => isRecord(command) ? [{
        name: stringValue(command.name),
        description: stringValue(command.description),
        argumentHint: isRecord(command.input) ? stringValue(command.input.hint) : "",
      }] : []),
    );
    return;
  }
  if (kind === "config_option_update") {
    applyConfig(path, { configOptions: update.configOptions as OpenCodeConfigOption[] });
    return;
  }
  if (kind === "current_mode_update") {
    const modeId = stringValue(update.currentModeId);
    openCodeChatStore.setState({
      permissionProfile: modeId,
      collaborationMode: modeId === "plan" ? "plan" : "default",
    });
    return;
  }
  if (kind === "session_info_update") {
    const title = stringValue(update.title);
    if (title) {
      openCodeChatStore.setState((state) => ({
        threadsByPath: {
          ...state.threadsByPath,
          [path]: sortThreads((state.threadsByPath[path] ?? []).map((thread) =>
            thread.id === threadId
              ? { ...thread, title, updatedAt: epochSeconds(update.updatedAt) }
              : thread)),
        },
      }));
    }
  }
  queueUpdate(threadId, update);
}

function handlePermissionRequest(threadId: string, requestId: RpcId, request: OpenCodePermissionRequest): void {
  const toolCall = isRecord(request.toolCall) ? request.toolCall : {};
  const kindValue = stringValue(toolCall.kind);
  const rawInput = isRecord(toolCall.rawInput) ? toolCall.rawInput : {};
  permissionOptionsByRequest.set(String(requestId), request.options ?? []);
  const pending: AgentPendingRequest = {
    sessionId: threadId,
    requestId,
    method: "opencode/requestPermission",
    kind: ["edit", "delete", "move"].includes(kindValue) ? "file-change" : "command",
    threadId,
    itemId: stringValue(toolCall.toolCallId) || undefined,
    reason: stringValue(toolCall.title),
    command: kindValue === "execute" ? stringValue(rawInput.command, stringValue(toolCall.title)) : stringValue(toolCall.title),
    cwd: stringValue(rawInput.cwd) || undefined,
    raw: { ...toolCall, options: request.options },
  };
  openCodeChatStore.setState((state) => ({
    requestsByThread: {
      ...state.requestsByThread,
      [threadId]: [
        ...(state.requestsByThread[threadId] ?? []).filter((item) => item.requestId !== requestId),
        pending,
      ],
    },
  }));
}

function removeRequest(threadId: string, requestId: RpcId): void {
  permissionOptionsByRequest.delete(String(requestId));
  openCodeChatStore.setState((state) => ({
    requestsByThread: {
      ...state.requestsByThread,
      [threadId]: (state.requestsByThread[threadId] ?? []).filter((request) => request.requestId !== requestId),
    },
  }));
}

async function connectClient(path: string): Promise<OpenCodeClient> {
  const client = new OpenCodeClient(`opencode-${crypto.randomUUID()}`, path, {
    onSessionUpdate: (sessionId, update) => handleSessionUpdate(path, sessionId, update),
    onPermissionRequest: (requestId, request) =>
      handlePermissionRequest(request.sessionId, requestId, request),
    onDiagnostic: (line) =>
      openCodeChatStore.setState((state) => ({ diagnostics: [...state.diagnostics.slice(-99), line] })),
    onExit: () => {
      clients.delete(path);
      clientPromises.delete(path);
      openCodeChatStore.setState((state) => {
        const sessionStatusByThread = { ...state.sessionStatusByThread };
        for (const [threadId, threadPath] of pathByThread) {
          if (threadPath === path) sessionStatusByThread[threadId] = "idle";
        }
        return { sessionStatusByThread };
      });
    },
  });
  await client.connect();
  clients.set(path, client);
  return client;
}

function ensureClient(path: string): Promise<OpenCodeClient> {
  const existing = clients.get(path);
  if (existing) return Promise.resolve(existing);
  const pending = clientPromises.get(path);
  if (pending) return pending;
  const promise = connectClient(path);
  clientPromises.set(path, promise);
  void promise
    .finally(() => {
      if (clientPromises.get(path) === promise) clientPromises.delete(path);
    })
    .catch(() => {});
  return promise;
}

function clientForThread(threadId: string): OpenCodeClient | undefined {
  const path = pathByThread.get(threadId);
  return path ? clients.get(path) : undefined;
}

async function applySessionSettings(client: OpenCodeClient, sessionId: string): Promise<void> {
  const state = openCodeChatStore.getState();
  if (state.model) await client.setModel(sessionId, state.model).catch(() => {});
  if (state.permissionProfile) await client.setMode(sessionId, state.permissionProfile).catch(() => {});
  if (state.reasoningEffort) {
    await client.setConfigOption(sessionId, EFFORT_CATEGORY, state.reasoningEffort).catch(() => {});
  }
}

function loadRepoFiles(path: string): Promise<Array<{ path: string; lowerPath: string; fileName: string }>> {
  const cached = repoFileCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  return invoke<string[]>("repo_list_files", { path }).then((files) => {
    const data = files.map((file) => ({
      path: file,
      lowerPath: file.toLocaleLowerCase(),
      fileName: file.split(/[\\/]/u).pop() ?? file,
    }));
    if (repoFileCache.size >= 3) {
      const oldest = repoFileCache.keys().next().value;
      if (oldest) repoFileCache.delete(oldest);
    }
    repoFileCache.set(path, { expiresAt: Date.now() + 30_000, data });
    return data;
  });
}

function promptBlocks(text: string, attachments: AgentAttachment[]): OpenCodeContentBlock[] {
  const commands = attachments
    .filter((attachment) => attachment.type === "skill")
    .map((attachment) => `/${attachment.name}`);
  const body = [...commands, text].filter(Boolean).join("\n\n");
  const blocks: OpenCodeContentBlock[] = body ? [{ type: "text", text: body }] : [];
  for (const attachment of attachments) {
    if (attachment.type === "skill") continue;
    blocks.push({
      type: "resource_link",
      uri: `file://${attachment.path}`,
      name: attachment.name || attachment.path,
    });
  }
  return blocks.length ? blocks : [{ type: "text", text }];
}

export async function warmOpenCodeModelCatalog(path: string): Promise<void> {
  if (!path || catalogWarmups.has(path)) return;
  catalogWarmups.add(path);
  try {
    const client = await ensureClient(path);
    const config = await client.newSession();
    applyConfig(path, config);
    await client.closeSession(config.sessionId).catch(() => {});
    // Antwort ohne configOptions darf den Warmup nicht dauerhaft blockieren.
    if (!openCodeChatStore.getState().models.length) catalogWarmups.delete(path);
  } catch (error) {
    catalogWarmups.delete(path);
    throw error;
  }
}

export async function openCodeCapabilitySnapshot(path: string, force = false) {
  if (force || !commandsByPath.has(path)) await warmOpenCodeModelCatalog(path).catch(() => {});
  const commands = commandsByPath.get(path) ?? [];
  return {
    skills: commands.map((command): AgentSkill => ({
      name: command.name,
      description: command.description,
      path: "",
      enabled: true,
    })),
    commands,
    agents: (configByPath.get(path) ? optionByCategory(configByPath.get(path)!, MODE_CATEGORY) : undefined)
      ? flatChoices(optionByCategory(configByPath.get(path)!, MODE_CATEGORY)!).map((choice) => ({
          name: choice.name,
          description: choice.description ?? "",
        }))
      : [],
    hooks: [],
    mcpServers: [],
  };
}

async function submitPrompt(
  threadId: string,
  text: string,
  attachments: AgentAttachment[],
  seeded: boolean,
): Promise<void> {
  const path = pathByThread.get(threadId) ?? openCodeChatStore.getState().conversations[threadId]?.path;
  if (!path) throw new Error("OpenCode-Unterhaltung wurde nicht gefunden.");
  const client = await ensureClient(path);
  const turnId = id("turn");
  updateConversation(threadId, (conversation) => ({
    ...conversation,
    activeTurnId: turnId,
    error: null,
    turns: [
      ...conversation.turns.map((turn) =>
        turn.status === "inProgress" ? { ...turn, status: "completed" as const } : turn),
      {
        id: turnId,
        items: [{
          id: id("user"),
          type: "userMessage",
          content: [
            { type: "text", text },
            ...attachments.map((attachment) => ({
              type: attachment.type,
              path: attachment.path,
              name: attachment.name,
            })),
          ],
        }],
        status: "inProgress" as const,
        startedAt: Date.now(),
      },
    ],
  }));
  if (seeded) {
    openCodeChatStore.setState((state) => ({
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
  }
  try {
    const result = await client.prompt(threadId, promptBlocks(text, attachments));
    flushUpdates();
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      activeTurnId: null,
      turns: conversation.turns.map((turn) => turn.id === turnId ? {
        ...turn,
        status: result.stopReason === "cancelled"
          ? "interrupted"
          : result.stopReason === "refusal"
            ? "failed"
            : "completed",
        completedAt: Date.now(),
      } : turn),
      tokenUsage: result.usage
        ? accumulateUsage(conversation.tokenUsage, {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
            modelContextWindow: conversation.tokenUsage?.modelContextWindow ?? null,
          })
        : conversation.tokenUsage,
    }));
  } catch (error) {
    flushUpdates();
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      activeTurnId: null,
      error: errorMessage(error),
      turns: conversation.turns.map((turn) => turn.id === turnId ? { ...turn, status: "failed" } : turn),
    }));
    throw error;
  }
}

export const openCodeChatStore = createStore<AgentChatState>()((set, get) => ({
  connectionStatus: "idle",
  connectionError: null,
  diagnostics: [],
  account: null,
  requiresAuth: false,
  loginStatus: "idle",
  loginError: null,
  rateLimits: null,
  accountUsage: null,
  models: loadModelCatalog("opencode"),
  defaultModel: null,
  threadsByPath: {},
  loadingPaths: {},
  sessionStatusByThread: {},
  conversations: {},
  visibleThreadId: null,
  activeThreadByPath: {},
  requestsByThread: {},
  model: typeof persistedSettings.model === "string" ? persistedSettings.model : null,
  reasoningEffort: typeof persistedSettings.reasoningEffort === "string" ? persistedSettings.reasoningEffort : "",
  serviceTier: null,
  personality: "none",
  collaborationMode: persistedSettings.collaborationMode === "plan" ? "plan" : "default",
  collaborationModes: [
    { name: "build", mode: "default", model: null, reasoningEffort: null },
    { name: "plan", mode: "plan", model: null, reasoningEffort: null },
  ],
  permissionProfiles: [],
  permissionProfilesPath: null,
  permissionProfile: typeof persistedSettings.permissionProfile === "string" ? persistedSettings.permissionProfile : null,
  realtimeVoices: null,
  realtimeVoice: null,
  approvalPolicy: persistedSettings.approvalPolicy === "never" || persistedSettings.approvalPolicy === "untrusted"
    ? persistedSettings.approvalPolicy
    : "on-request",
  sandboxMode: persistedSettings.sandboxMode === "read-only" || persistedSettings.sandboxMode === "danger-full-access"
    ? persistedSettings.sandboxMode
    : "workspace-write",

  retainSurface: () => {
    surfaceReferences += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      surfaceReferences = Math.max(0, surfaceReferences - 1);
    };
  },
  setVisibleThread: (visibleThreadId) => {
    if (visibleThreadId) conversationLastUsed.set(visibleThreadId, Date.now());
    set({ visibleThreadId });
  },
  connect: async () => {
    // The ACP process is started per repository on demand; there is no global
    // handshake and opencode manages its own provider credentials.
    set({ connectionStatus: "ready", connectionError: null, requiresAuth: false });
  },
  refreshAccount: async () => {
    await get().connect();
  },
  startLogin: async () => {
    set({ loginStatus: "error", loginError: "Melde dich im Terminal mit `opencode auth login` an." });
    throw new Error("Melde dich im Terminal mit `opencode auth login` an.");
  },
  logout: async () => {
    for (const client of clients.values()) await client.logout().catch(() => {});
    set({ account: null });
  },
  loadThreads: async (paths) => {
    const unique = [...new Set(paths.filter(Boolean))];
    if (unique.length === 0) return;
    set((state) => ({
      loadingPaths: { ...state.loadingPaths, ...Object.fromEntries(unique.map((path) => [path, true])) },
    }));
    try {
      const grouped: Record<string, AgentThreadSummary[]> = {};
      await Promise.all(unique.map(async (path) => {
        const client = await ensureClient(path).catch(() => null);
        const sessions = client ? await client.listSessions().catch(() => []) : [];
        grouped[path] = sortThreads(sessions.map((session): AgentThreadSummary => {
          pathByThread.set(session.sessionId, path);
          return {
            id: session.sessionId,
            path,
            title: session.title?.trim() || "Neue Unterhaltung",
            preview: session.title?.trim() ?? "",
            createdAt: epochSeconds(session.updatedAt),
            updatedAt: epochSeconds(session.updatedAt),
            status: "idle",
            modelProvider: "opencode",
            isPinned: sessionPrefs.pinned.has(session.sessionId),
            archived: sessionPrefs.archived.has(session.sessionId),
          };
        }));
      }));
      set((state) => ({ threadsByPath: { ...state.threadsByPath, ...grouped } }));
    } finally {
      set((state) => ({
        loadingPaths: { ...state.loadingPaths, ...Object.fromEntries(unique.map((path) => [path, false])) },
      }));
    }
  },
  createThread: async (path) => {
    const client = await ensureClient(path);
    set((state) => ({ sessionStatusByThread: { ...state.sessionStatusByThread, [path]: "connecting" } }));
    const config = await client.newSession();
    const threadId = config.sessionId;
    pathByThread.set(threadId, path);
    applyConfig(path, config);
    await applySessionSettings(client, threadId);
    const now = Math.floor(Date.now() / 1000);
    const thread: AgentThreadSummary = {
      id: threadId,
      path,
      title: "Neue Unterhaltung",
      preview: "",
      createdAt: now,
      updatedAt: now,
      status: "idle",
      modelProvider: "opencode",
    };
    set((state) => ({
      threadsByPath: { ...state.threadsByPath, [path]: sortThreads([thread, ...(state.threadsByPath[path] ?? [])]) },
      conversations: cacheConversation(state, threadId, emptyConversation(thread)),
      activeThreadByPath: { ...state.activeThreadByPath, [path]: threadId },
      sessionStatusByThread: { ...state.sessionStatusByThread, [threadId]: "ready" },
    }));
    return threadId;
  },
  openThread: async (path, threadId) => {
    conversationLastUsed.set(threadId, Date.now());
    pathByThread.set(threadId, path);
    set((state) => ({ activeThreadByPath: { ...state.activeThreadByPath, [path]: threadId } }));
    if (get().conversations[threadId]) return;
    const thread = get().threadsByPath[path]?.find((candidate) => candidate.id === threadId) ?? {
      id: threadId,
      path,
      title: "Unterhaltung",
      preview: "",
      createdAt: 0,
      updatedAt: 0,
      status: "idle",
      modelProvider: "opencode",
    };
    set((state) => ({
      conversations: cacheConversation(state, threadId, { ...emptyConversation(thread), loading: true }),
      sessionStatusByThread: { ...state.sessionStatusByThread, [threadId]: "connecting" },
    }));
    replayingThreads.add(threadId);
    try {
      const client = await ensureClient(path);
      // `session/load` replays the transcript as session/update notifications
      // before it resolves, so the queued batch below becomes the history.
      const config = await client.loadSession(threadId).catch(() => client.resumeSession(threadId));
      applyConfig(path, config);
      flushUpdates();
      updateConversation(threadId, (conversation) => ({
        ...conversation,
        loading: false,
        activeTurnId: null,
        turns: conversation.turns.map((turn) => ({ ...turn, status: "completed" })),
      }));
      set((state) => ({ sessionStatusByThread: { ...state.sessionStatusByThread, [threadId]: "ready" } }));
    } catch (error) {
      updateConversation(threadId, (conversation) => ({
        ...conversation,
        loading: false,
        error: errorMessage(error),
      }));
      set((state) => ({ sessionStatusByThread: { ...state.sessionStatusByThread, [threadId]: "error" } }));
    } finally {
      replayingThreads.delete(threadId);
    }
  },
  sendMessage: async (path, text, attachments = []) => {
    let threadId = get().activeThreadByPath[path];
    if (!threadId) threadId = await get().createThread(path);
    await submitPrompt(threadId, text, attachments, true);
  },
  steerMessage: async (threadId, text, attachments = []) => {
    await submitPrompt(threadId, text, attachments, false);
  },
  interrupt: async (threadId) => {
    await clientForThread(threadId)?.cancel(threadId).catch(() => {});
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      activeTurnId: null,
      turns: conversation.turns.map((turn) =>
        turn.id === conversation.activeTurnId ? { ...turn, status: "interrupted" } : turn),
    }));
  },
  respondToRequest: async (request, result) => {
    const client = clientForThread(request.threadId);
    if (!client) throw new Error("OpenCode-Session ist nicht mehr aktiv.");
    const options = permissionOptionsByRequest.get(String(request.requestId)) ?? [];
    const decision = isRecord(result) ? stringValue(result.decision) : "";
    const wanted = decision === "decline" || decision === "rejected"
      ? "reject_once"
      : decision === "acceptForSession"
        ? "allow_always"
        : "allow_once";
    const option = options.find((candidate) => candidate.kind === wanted)
      ?? options.find((candidate) => candidate.kind.startsWith(wanted.startsWith("reject") ? "reject" : "allow"))
      ?? options[0];
    await client.respondPermission(request.requestId, option?.optionId ?? null);
    removeRequest(request.threadId, request.requestId);
  },
  rejectUnsupportedRequest: async (request) => {
    await clientForThread(request.threadId)?.respondPermission(request.requestId, null).catch(() => {});
    removeRequest(request.threadId, request.requestId);
  },
  archiveThread: async (path, threadId) => {
    sessionPrefs.archived.add(threadId);
    saveSessionPrefs();
    set((state) => ({
      threadsByPath: {
        ...state.threadsByPath,
        [path]: (state.threadsByPath[path] ?? []).map((thread) =>
          thread.id === threadId ? { ...thread, archived: true } : thread),
      },
      activeThreadByPath: {
        ...state.activeThreadByPath,
        [path]: state.activeThreadByPath[path] === threadId ? null : state.activeThreadByPath[path],
      },
    }));
  },
  unarchiveThread: async (path, threadId) => {
    sessionPrefs.archived.delete(threadId);
    saveSessionPrefs();
    set((state) => ({
      threadsByPath: {
        ...state.threadsByPath,
        [path]: sortThreads((state.threadsByPath[path] ?? []).map((thread) =>
          thread.id === threadId ? { ...thread, archived: false } : thread)),
      },
    }));
  },
  deleteThread: async (path, threadId) => {
    await clientForThread(threadId)?.closeSession(threadId).catch(() => {});
    await invoke("opencode_delete_session", { path, sessionId: threadId });
    pathByThread.delete(threadId);
    conversationLastUsed.delete(threadId);
    updateQueue.delete(threadId);
    sessionPrefs.pinned.delete(threadId);
    sessionPrefs.archived.delete(threadId);
    saveSessionPrefs();
    set((state) => {
      const conversations = { ...state.conversations };
      delete conversations[threadId];
      return {
        conversations,
        threadsByPath: {
          ...state.threadsByPath,
          [path]: (state.threadsByPath[path] ?? []).filter((thread) => thread.id !== threadId),
        },
        activeThreadByPath: {
          ...state.activeThreadByPath,
          [path]: state.activeThreadByPath[path] === threadId ? null : state.activeThreadByPath[path],
        },
      };
    });
  },
  renameThread: async (path, threadId, name) => {
    set((state) => ({
      threadsByPath: {
        ...state.threadsByPath,
        [path]: (state.threadsByPath[path] ?? []).map((thread) =>
          thread.id === threadId ? { ...thread, title: name } : thread),
      },
      conversations: state.conversations[threadId]
        ? { ...state.conversations, [threadId]: { ...state.conversations[threadId], title: name } }
        : state.conversations,
    }));
  },
  setThreadPinned: async (path, threadId, isPinned) => {
    if (isPinned) sessionPrefs.pinned.add(threadId);
    else sessionPrefs.pinned.delete(threadId);
    saveSessionPrefs();
    set((state) => ({
      threadsByPath: {
        ...state.threadsByPath,
        [path]: sortThreads((state.threadsByPath[path] ?? []).map((thread) =>
          thread.id === threadId ? { ...thread, isPinned } : thread)),
      },
    }));
  },
  startReview: async (threadId, instructions) => {
    await get().steerMessage(
      threadId,
      instructions
        ? `Review the current changes in this repository. ${instructions}`
        : "Review the current changes in this repository and report correctness, security and style problems.",
    );
  },
  compactThread: async (threadId) => {
    await get().steerMessage(threadId, "/compact");
  },
  forkThread: async (path, threadId) => {
    const client = await ensureClient(path);
    const config = await client.forkSession(threadId);
    const forkId = config.sessionId;
    pathByThread.set(forkId, path);
    applyConfig(path, config);
    const original = get().threadsByPath[path]?.find((thread) => thread.id === threadId);
    const now = Math.floor(Date.now() / 1000);
    const fork: AgentThreadSummary = {
      ...(original ?? { path, preview: "", status: "idle", modelProvider: "opencode", title: "Unterhaltung" }),
      id: forkId,
      title: `${original?.title ?? "Unterhaltung"} (Fork)`,
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({
      threadsByPath: { ...state.threadsByPath, [path]: sortThreads([fork, ...(state.threadsByPath[path] ?? [])]) },
      conversations: state.conversations[threadId]
        ? cacheConversation(state, forkId, {
            ...state.conversations[threadId],
            threadId: forkId,
            title: fork.title,
            activeTurnId: null,
          })
        : state.conversations,
      activeThreadByPath: { ...state.activeThreadByPath, [path]: forkId },
    }));
    return forkId;
  },
  listSkills: async (path, forceReload) => {
    const snapshot = await openCodeCapabilitySnapshot(path, forceReload === true);
    return snapshot.skills;
  },
  loadPermissionProfiles: async (path) => {
    await warmOpenCodeModelCatalog(path).catch(() => {});
    set({ permissionProfilesPath: path });
  },
  listApps: async () => [],
  listMcpServers: async (threadId) => {
    const cwd = threadId ? get().conversations[threadId]?.path : get().permissionProfilesPath;
    const output = await openCodeCli(["mcp", "list"], cwd ?? undefined).catch(() => "");
    return parseOpenCodeMcpServers(output).map(
      (server): AgentMcpServer => ({ name: server.name, tools: [], authStatus: server.status }),
    );
  },
  loginMcpServer: async (name, threadId) => {
    const cwd = threadId ? get().conversations[threadId]?.path : get().permissionProfilesPath;
    await openCodeCli(["mcp", "auth", name], cwd ?? undefined);
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
  listHooks: async () => [],
  listPlugins: async () => [],
  detectExternalAgentConfig: async () => [],
  listExternalAgentConfigImportHistories: async () => [],
  importExternalAgentConfig: async () => [],
  sendFeedback: async () => {
    throw new Error("OpenCode nimmt Feedback über GitHub Issues entgegen.");
  },
  listBackgroundTerminals: async () => [],
  stopBackgroundTerminals: async () => {},
  terminateBackgroundTerminal: async () => false,
  setGoal: async (threadId, objective) =>
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      goal: { threadId, objective, status: "active", tokenBudget: null, tokensUsed: 0, timeUsedSeconds: 0 },
    })),
  clearGoal: async (threadId) =>
    updateConversation(threadId, (conversation) => ({ ...conversation, goal: null })),
  setMemoryMode: async () => {},
  resetMemory: async () => {},
  setModel: (model) => {
    set({ model });
    for (const [threadId, path] of pathByThread) {
      void clients.get(path)?.setModel(threadId, model).catch(() => {});
    }
  },
  setReasoningEffort: (reasoningEffort) => {
    set({ reasoningEffort });
    for (const [threadId, path] of pathByThread) {
      void clients.get(path)?.setConfigOption(threadId, EFFORT_CATEGORY, reasoningEffort).catch(() => {});
    }
  },
  setServiceTier: (serviceTier) => set({ serviceTier }),
  setPersonality: (personality) => set({ personality }),
  setCollaborationMode: (collaborationMode) => {
    const profiles = get().permissionProfiles;
    const target = collaborationMode === "plan"
      ? profiles.find((profile) => profile.id === "plan")?.id ?? "plan"
      : profiles.find((profile) => profile.id !== "plan")?.id ?? "build";
    set({ collaborationMode, permissionProfile: target });
    for (const [threadId, path] of pathByThread) {
      void clients.get(path)?.setMode(threadId, target).catch(() => {});
    }
  },
  setPermissionProfile: (permissionProfile) => {
    set({
      permissionProfile,
      collaborationMode: permissionProfile === "plan" ? "plan" : "default",
    });
    if (!permissionProfile) return;
    for (const [threadId, path] of pathByThread) {
      void clients.get(path)?.setMode(threadId, permissionProfile).catch(() => {});
    }
  },
  setRealtimeVoice: (realtimeVoice) => set({ realtimeVoice }),
  setApprovalPolicy: (approvalPolicy) => set({ approvalPolicy }),
  setSandboxMode: (sandboxMode) => set({ sandboxMode }),
  clearError: (threadId) => {
    if (!threadId) return set({ connectionError: null });
    updateConversation(threadId, (conversation) => ({ ...conversation, error: null }));
  },
}));

let lastPersistedSettings = "";
openCodeChatStore.subscribe((state) => {
  if (typeof window === "undefined") return;
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
  window.localStorage.setItem(SETTINGS_KEY, value);
});
