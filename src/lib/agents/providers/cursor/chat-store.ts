import { invoke } from "@/lib/platform/ipc";
import { kvGet, kvSet } from "@/lib/platform/kv";
import {
  CURSOR_SESSION_PREFS_KEY as PREFS_KEY,
  CURSOR_SETTINGS_KEY as SETTINGS_KEY,
  CURSOR_TRANSCRIPTS_KEY as TRANSCRIPTS_KEY,
} from "@/lib/agents/storage-keys";
import { createStore } from "zustand/vanilla";

import { isRepoAgentsTrusted } from "@/lib/agent-trust-prefs";

import type { AgentChatState } from "@/lib/agents/chat-store";
import { loadModelCatalog, saveModelCatalog } from "@/lib/agents/model-catalog";
import { accumulateUsage } from "@/lib/agents/token-cost";
import {
  CursorClient,
  cursorCli,
  cursorCreateChat,
  parseCursorMcpServers,
  parseCursorModels,
  parseCursorStatus,
} from "@/lib/agents/providers/cursor/client";
import type {
  AgentAttachment,
  AgentConversation,
  AgentFileMatch,
  AgentHook,
  AgentItem,
  AgentMcpServer,
  AgentModelOption,
  AgentSkill,
  AgentThreadSummary,
  AgentTurn,
} from "@/lib/agents/types";

type UnknownRecord = Record<string, unknown>;

interface CursorSessionSummary {
  id: string;
  path: string;
  title: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
}

const clients = new Map<string, CursorClient>();
const repoFileCache = new Map<string, { expiresAt: number; data: string[] }>();
const modelWarmups = new Set<string>();
const REPO_FILE_CACHE_MS = 30_000;
const SESSION_LIST_CACHE_MS = 10_000;
const sessionListCache = new Map<string, { expiresAt: number; data: CursorSessionSummary[] }>();
const sessionListPromises = new Map<string, Promise<CursorSessionSummary[]>>();

function loadSessionList(unique: string[]): Promise<CursorSessionSummary[]> {
  const key = [...unique].sort().join("\u0000");
  const cached = sessionListCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  const pending = sessionListPromises.get(key);
  if (pending) return pending;
  const promise = invoke<CursorSessionSummary[]>("cursor_list_sessions", { paths: unique }).then((data) => {
    if (sessionListCache.size >= 8) {
      const oldest = sessionListCache.keys().next().value;
      if (oldest) sessionListCache.delete(oldest);
    }
    sessionListCache.set(key, { expiresAt: Date.now() + SESSION_LIST_CACHE_MS, data });
    return data;
  });
  sessionListPromises.set(key, promise);
  void promise.finally(() => {
    if (sessionListPromises.get(key) === promise) sessionListPromises.delete(key);
  }).catch(() => {});
  return promise;
}
const MAX_TRANSCRIPTS = 12;

let sequence = 1;

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

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = kvGet(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const prefs = (() => {
  const value = readJson<{ pinned?: string[]; archived?: string[] }>(PREFS_KEY, {});
  return { pinned: new Set(value.pinned ?? []), archived: new Set(value.archived ?? []) };
})();

function savePrefs() {
  kvSet(
    PREFS_KEY,
    JSON.stringify({ pinned: [...prefs.pinned], archived: [...prefs.archived] }),
  );
}

const settings = (() => {
  const value = readJson<UnknownRecord>(SETTINGS_KEY, {});
  return {
    model: typeof value.model === "string" ? value.model : null,
    collaborationMode: value.collaborationMode === "plan" ? ("plan" as const) : ("default" as const),
    permissionProfile: typeof value.permissionProfile === "string" ? value.permissionProfile : "force",
    approvalPolicy:
      value.approvalPolicy === "never" || value.approvalPolicy === "untrusted"
        ? value.approvalPolicy
        : ("on-request" as const),
    sandboxMode:
      value.sandboxMode === "read-only" || value.sandboxMode === "danger-full-access"
        ? value.sandboxMode
        : ("workspace-write" as const),
  };
})();

/**
 * The Cursor CLI keeps its transcripts in an opaque SQLite blob store, so the
 * turns we rendered ourselves are what we can replay when a chat is reopened.
 */
const transcripts = new Map<string, AgentTurn[]>(
  Object.entries(readJson<Record<string, AgentTurn[]>>(TRANSCRIPTS_KEY, {})),
);

function saveTranscripts() {
  const entries = [...transcripts.entries()].slice(-MAX_TRANSCRIPTS);
  transcripts.clear();
  for (const [threadId, turns] of entries) transcripts.set(threadId, turns);
  try {
    kvSet(TRANSCRIPTS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    const kept = entries.slice(-Math.ceil(entries.length / 2));
    kvSet(TRANSCRIPTS_KEY, JSON.stringify(Object.fromEntries(kept)));
  }
}

function rememberTranscript(threadId: string, turns: AgentTurn[]) {
  transcripts.delete(threadId);
  transcripts.set(threadId, turns);
  saveTranscripts();
}

function sortThreads(threads: AgentThreadSummary[]): AgentThreadSummary[] {
  return [...threads].sort(
    (a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt,
  );
}

function summary(value: CursorSessionSummary): AgentThreadSummary {
  return {
    ...value,
    status: "idle",
    modelProvider: "cursor",
    isPinned: prefs.pinned.has(value.id),
    archived: prefs.archived.has(value.id),
  };
}

function emptyConversation(thread: AgentThreadSummary): AgentConversation {
  const state = cursorChatStore.getState();
  return {
    threadId: thread.id,
    path: thread.path,
    title: thread.title,
    model: state.model ?? "",
    reasoningEffort: null,
    collaborationMode: state.collaborationMode,
    approvalPolicy: state.approvalPolicy,
    sandboxMode: state.sandboxMode,
    turns: transcripts.get(thread.id) ?? [],
    activeTurnId: null,
    loading: false,
    error: null,
  };
}

function updateConversation(
  threadId: string,
  updater: (conversation: AgentConversation) => AgentConversation,
) {
  cursorChatStore.setState((state) => {
    const conversation = state.conversations[threadId];
    if (!conversation) return {};
    const next = updater(conversation);
    return { conversations: { ...state.conversations, [threadId]: next } };
  });
}

function todoStatus(value: unknown): string {
  const status = stringValue(value);
  if (status.endsWith("COMPLETED")) return "completed";
  if (status.endsWith("IN_PROGRESS")) return "inProgress";
  if (status.endsWith("CANCELLED")) return "completed";
  return "pending";
}

function toolLabel(key: string): string {
  const name = key.replace(/ToolCall$/u, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function outputText(success: UnknownRecord): string {
  const stdout = stringValue(success.stdout);
  const stderr = stringValue(success.stderr);
  return [stdout, stderr].filter(Boolean).join("\n");
}

/** Maps one Cursor `tool_call` payload onto the item shapes the chat renders. */
function toolItem(itemId: string, key: string, payload: UnknownRecord, completed: boolean): AgentItem {
  const args = isRecord(payload.args) ? payload.args : {};
  const result = isRecord(payload.result) ? payload.result : null;
  const success = result && isRecord(result.success) ? result.success : null;
  const failure = result && !success;
  const status = !completed ? "inProgress" : failure ? "failed" : "completed";
  const error = failure
    ? stringValue(
        isRecord(result.error) ? result.error.message : result.error,
        "Cursor-Tool ist fehlgeschlagen.",
      )
    : undefined;
  const base = { id: itemId, status, error, toolUseId: stringValue(payload.toolCallId, itemId) };

  if (key === "shellToolCall") {
    return {
      ...base,
      type: "commandExecution",
      command: stringValue(args.command, "Befehl"),
      cwd: stringValue(args.workingDirectory),
      aggregatedOutput: success ? outputText(success) : "",
      exitCode: success ? success.exitCode : undefined,
    };
  }
  if (key === "editToolCall" || key === "writeToolCall" || key === "deleteToolCall") {
    const path = stringValue(args.path, stringValue(success?.path));
    return {
      ...base,
      type: "fileChange",
      changes: [{ path, diff: stringValue(success?.diffString) }],
      linesAdded: success?.linesAdded,
      linesRemoved: success?.linesRemoved,
    };
  }
  if (key === "updateTodosToolCall") {
    return {
      ...base,
      type: "plan",
      plan: arrayValue(args.todos)
        .filter(isRecord)
        .map((todo) => ({ step: stringValue(todo.content), status: todoStatus(todo.status) })),
    };
  }
  if (key === "webSearchToolCall" || key === "searchToolCall") {
    return {
      ...base,
      type: "webSearch",
      query: stringValue(args.query, stringValue(args.searchTerm)),
      results: arrayValue(success?.results),
    };
  }
  return {
    ...base,
    type: key === "mcpToolCall" ? "mcpToolCall" : "dynamicToolCall",
    server: key === "mcpToolCall" ? stringValue(args.serverName, "MCP") : "Cursor",
    tool: key === "mcpToolCall" ? stringValue(args.toolName, toolLabel(key)) : toolLabel(key),
    arguments: args,
    result: success ?? result ?? undefined,
  };
}

function replaceItem(turn: AgentTurn, item: AgentItem): AgentTurn {
  const index = turn.items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) return { ...turn, items: [...turn.items, item] };
  const items = [...turn.items];
  items[index] = { ...items[index], ...item };
  return { ...turn, items };
}

function activeTurn(conversation: AgentConversation): AgentTurn | null {
  return conversation.turns.find((turn) => turn.id === conversation.activeTurnId) ?? null;
}

function applyToActiveTurn(
  conversation: AgentConversation,
  updater: (turn: AgentTurn) => AgentTurn,
): AgentConversation {
  const current = activeTurn(conversation);
  if (!current) return conversation;
  return {
    ...conversation,
    turns: conversation.turns.map((turn) => (turn.id === current.id ? updater(turn) : turn)),
  };
}

/**
 * Cursor streams text twice: as deltas and again as one canonical frame. The
 * canonical frame is a superset of what we already appended, so it replaces
 * the buffer instead of doubling it.
 */
function mergeText(previous: string, incoming: string): string {
  if (!incoming) return previous;
  if (!previous) return incoming;
  if (previous === incoming || previous.endsWith(incoming)) return previous;
  if (incoming.startsWith(previous)) return incoming;
  return `${previous}${incoming}`;
}

function handleEvent(threadId: string, event: UnknownRecord) {
  const type = stringValue(event.type);
  const subtype = stringValue(event.subtype);

  if (type === "system" && subtype === "init") {
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      model: stringValue(event.model, conversation.model),
    }));
    return;
  }

  if (type === "thinking") {
    if (subtype === "completed") {
      updateConversation(threadId, (conversation) =>
        applyToActiveTurn(conversation, (turn) => ({
          ...turn,
          items: turn.items.map((item) =>
            item.__cursorOpenReasoning === true ? { ...item, __cursorOpenReasoning: false } : item,
          ),
        })),
      );
      return;
    }
    const text = stringValue(event.text);
    if (!text) return;
    updateConversation(threadId, (conversation) =>
      applyToActiveTurn(conversation, (turn) => {
        const open = turn.items.find((item) => item.__cursorOpenReasoning === true);
        if (!open) {
          return {
            ...turn,
            items: [
              ...turn.items,
              { id: id("reasoning"), type: "reasoning", summary: [], content: [text], __cursorOpenReasoning: true },
            ],
          };
        }
        return replaceItem(turn, {
          ...open,
          content: [`${arrayValue(open.content).join("")}${text}`],
        });
      }),
    );
    return;
  }

  if (type === "assistant" && isRecord(event.message)) {
    const text = arrayValue((event.message as UnknownRecord).content)
      .filter(isRecord)
      .filter((block) => block.type === "text")
      .map((block) => stringValue(block.text))
      .join("");
    if (!text) return;
    updateConversation(threadId, (conversation) =>
      applyToActiveTurn(conversation, (turn) => {
        const open = turn.items.find((item) => item.__cursorOpenMessage === true);
        if (!open) {
          return {
            ...turn,
            items: [
              ...turn.items,
              { id: id("message"), type: "agentMessage", text, __cursorOpenMessage: true },
            ],
          };
        }
        return replaceItem(turn, { ...open, text: mergeText(stringValue(open.text), text) });
      }),
    );
    return;
  }

  if (type === "tool_call" && isRecord(event.tool_call)) {
    const payload = event.tool_call as UnknownRecord;
    const key = Object.keys(payload).find((candidate) => candidate.endsWith("ToolCall"));
    if (!key || !isRecord(payload[key])) return;
    const callId = stringValue(event.call_id, id("tool"));
    const item = toolItem(callId, key, payload[key] as UnknownRecord, subtype === "completed");
    updateConversation(threadId, (conversation) =>
      applyToActiveTurn(conversation, (turn) => {
        // A tool call ends the current text block; the next one starts fresh.
        const closed = turn.items.map((candidate) =>
          candidate.__cursorOpenMessage === true ? { ...candidate, __cursorOpenMessage: false } : candidate,
        );
        return replaceItem({ ...turn, items: closed }, item);
      }),
    );
    return;
  }

  if (type === "result") {
    const failed = event.is_error === true;
    const usage = isRecord(event.usage) ? event.usage : null;
    updateConversation(threadId, (conversation) => {
      const next = applyToActiveTurn(conversation, (turn) => ({
        ...turn,
        status: failed ? "failed" : "completed",
        completedAt: Date.now(),
        durationMs: typeof event.duration_ms === "number" ? event.duration_ms : turn.durationMs,
        error: failed ? stringValue(event.result, "Cursor-Turn ist fehlgeschlagen.") : null,
        items: turn.items.map((item) => ({
          ...item,
          __cursorOpenMessage: false,
          __cursorOpenReasoning: false,
        })),
      }));
      rememberTranscript(threadId, next.turns);
      return {
        ...next,
        activeTurnId: null,
        error: failed ? stringValue(event.result, "Cursor-Turn ist fehlgeschlagen.") : null,
        tokenUsage: usage
          ? accumulateUsage(conversation.tokenUsage, {
              inputTokens: Number(usage.inputTokens ?? 0),
              outputTokens: Number(usage.outputTokens ?? 0),
              cacheReadTokens: Number(usage.cachedInputTokens ?? usage.cacheReadInputTokens ?? 0),
              cacheWriteTokens: Number(usage.cacheWriteInputTokens ?? 0),
            })
          : conversation.tokenUsage,
      };
    });
    cursorChatStore.setState((state) => ({
      sessionStatusByThread: { ...state.sessionStatusByThread, [threadId]: "ready" },
    }));
  }
}

function clientFor(threadId: string): CursorClient {
  const existing = clients.get(threadId);
  if (existing) return existing;
  const client = new CursorClient(threadId, {
    onEvent: (event) => handleEvent(threadId, event),
    onDiagnostic: (line) =>
      cursorChatStore.setState((state) => ({ diagnostics: [...state.diagnostics.slice(-99), line] })),
    onExit: (code) => {
      cursorChatStore.setState((state) => ({
        sessionStatusByThread: { ...state.sessionStatusByThread, [threadId]: code === 0 ? "ready" : "error" },
      }));
      updateConversation(threadId, (conversation) => {
        if (!conversation.activeTurnId) return conversation;
        const next = applyToActiveTurn(conversation, (turn) => ({
          ...turn,
          status: code === 0 ? "completed" : "failed",
          completedAt: Date.now(),
          error: code === 0 ? turn.error ?? null : `Cursor CLI wurde beendet (Exit ${code}).`,
        }));
        rememberTranscript(threadId, next.turns);
        return {
          ...next,
          activeTurnId: null,
          error: code === 0 ? next.error : `Cursor CLI wurde beendet (Exit ${code}).`,
        };
      });
    },
  });
  clients.set(threadId, client);
  return client;
}

/** Cursor exposes execution modes rather than per-call approvals. */
function cliMode(state = cursorChatStore.getState()): string {
  if (state.collaborationMode === "plan") return "plan";
  if (state.permissionProfile && state.permissionProfile !== "default") return state.permissionProfile;
  if (state.approvalPolicy === "never") return "force";
  if (state.approvalPolicy === "untrusted") return "ask";
  return "auto-review";
}

function cliSandbox(state = cursorChatStore.getState()): string | undefined {
  if (state.sandboxMode === "read-only") return "enabled";
  if (state.sandboxMode === "danger-full-access") return "disabled";
  return undefined;
}

function promptText(text: string, attachments: AgentAttachment[]): string {
  const skills = attachments.filter((item) => item.type === "skill").map((item) => `/${item.name}`);
  const files = attachments.filter((item) => item.type !== "skill").map((item) => `@${item.path}`);
  return [...skills, text, ...files].filter(Boolean).join("\n\n");
}

async function runTurn(threadId: string, path: string, prompt: string): Promise<void> {
  const state = cursorChatStore.getState();
  cursorChatStore.setState((current) => ({
    sessionStatusByThread: { ...current.sessionStatusByThread, [threadId]: "connecting" },
  }));
  await clientFor(threadId).send({
    cwd: path,
    prompt,
    resumeSessionId: threadId,
    model: state.model ?? undefined,
    permissionMode: cliMode(state),
    sandbox: cliSandbox(state),
    agentsTrusted: isRepoAgentsTrusted(path),
  });
  cursorChatStore.setState((current) => ({
    sessionStatusByThread: { ...current.sessionStatusByThread, [threadId]: "ready" },
  }));
}

async function repoFiles(path: string): Promise<string[]> {
  const cached = repoFileCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await invoke<string[]>("repo_list_files", { path });
  if (repoFileCache.size >= 3) {
    const oldest = repoFileCache.keys().next().value;
    if (oldest) repoFileCache.delete(oldest);
  }
  repoFileCache.set(path, { expiresAt: Date.now() + REPO_FILE_CACHE_MS, data });
  return data;
}

export async function warmCursorModelCatalog(path: string): Promise<void> {
  if (modelWarmups.has(path)) return;
  modelWarmups.add(path);
  try {
    const models = parseCursorModels(await cursorCli(["models"], path || undefined)).map(
      (model, index): AgentModelOption => ({
        id: model.id,
        label: model.label,
        description: "Cursor CLI",
        isDefault: index === 0,
        inputModalities: ["text"],
        reasoningEfforts: [],
        defaultReasoningEffort: "",
        serviceTiers: [],
        defaultServiceTier: null,
        supportsPersonality: false,
      }),
    );
    if (!models.length) return;
    saveModelCatalog("cursor", models);
    cursorChatStore.setState((state) => ({
      models,
      defaultModel: models[0].id,
      model: state.model && models.some((model) => model.id === state.model) ? state.model : models[0].id,
    }));
  } catch {
    modelWarmups.delete(path);
  }
}

/** Cursor's project instructions live in `.cursor/rules`, so they act as skills. */
export async function cursorCapabilitySnapshot(path: string) {
  const [skills, mcpServers] = await Promise.all([
    cursorChatStore.getState().listSkills(path),
    cursorChatStore.getState().listMcpServers().catch(() => []),
  ]);
  return { skills, commands: [], agents: [], hooks: [], mcpServers };
}

const permissionProfiles = [
  { id: "force", description: "Alle Befehle ohne Rückfrage ausführen (--force).", allowed: true },
  { id: "auto-review", description: "Sichere Aktionen automatisch, Rest prüfen (--auto-review).", allowed: true },
  { id: "ask", description: "Nur Fragen beantworten, keine Änderungen (--mode ask).", allowed: true },
  { id: "plan", description: "Nur planen, keine Änderungen (--plan).", allowed: true },
];

export const cursorChatStore = createStore<AgentChatState>()((set, get) => ({
  connectionStatus: "idle",
  connectionError: null,
  diagnostics: [],
  account: null,
  requiresAuth: false,
  loginStatus: "idle",
  loginError: null,
  rateLimits: null,
  accountUsage: null,
  models: loadModelCatalog("cursor"),
  defaultModel: null,
  threadsByPath: {},
  loadingPaths: {},
  sessionStatusByThread: {},
  conversations: {},
  visibleThreadId: null,
  activeThreadByPath: {},
  requestsByThread: {},
  model: settings.model,
  reasoningEffort: "",
  serviceTier: null,
  personality: "none",
  collaborationMode: settings.collaborationMode,
  collaborationModes: [
    { name: "Default", mode: "default", model: null, reasoningEffort: null },
    { name: "Plan", mode: "plan", model: null, reasoningEffort: null },
  ],
  permissionProfiles,
  permissionProfilesPath: null,
  permissionProfile: settings.permissionProfile,
  realtimeVoices: null,
  realtimeVoice: null,
  approvalPolicy: settings.approvalPolicy as AgentChatState["approvalPolicy"],
  sandboxMode: settings.sandboxMode as AgentChatState["sandboxMode"],

  retainSurface: () => () => {},
  setVisibleThread: (visibleThreadId) => set({ visibleThreadId }),
  connect: async () => {
    set({ connectionStatus: "connecting", connectionError: null });
    try {
      const account = parseCursorStatus(await cursorCli(["status"]));
      set({
        connectionStatus: "ready",
        requiresAuth: !account.loggedIn,
        account: account.loggedIn ? { type: "cursor", email: account.email, planType: null } : null,
      });
    } catch (error) {
      set({ connectionStatus: "error", connectionError: errorMessage(error), requiresAuth: true });
      throw error;
    }
  },
  refreshAccount: async () => {
    await get().connect();
  },
  startLogin: async () => {
    set({
      loginStatus: "error",
      loginError: "Melde dich einmalig im Terminal mit `cursor-agent login` an.",
    });
    throw new Error("Cursor-Login läuft nur im Terminal: `cursor-agent login`.");
  },
  logout: async () => {
    for (const client of clients.values()) await client.close().catch(() => {});
    clients.clear();
    set({ account: null, requiresAuth: true });
  },
  loadThreads: async (paths) => {
    const unique = [...new Set(paths.filter(Boolean))];
    if (!unique.length) return;
    set((state) => ({
      loadingPaths: { ...state.loadingPaths, ...Object.fromEntries(unique.map((path) => [path, true])) },
    }));
    try {
      const sessions = await loadSessionList(unique);
      const grouped: Record<string, AgentThreadSummary[]> = Object.fromEntries(
        unique.map((path) => [path, []]),
      );
      for (const session of sessions) {
        if (!grouped[session.path]) continue;
        grouped[session.path].push(summary(session));
      }
      set((state) => {
        const merged: Record<string, AgentThreadSummary[]> = {};
        for (const path of unique) {
          const known = state.threadsByPath[path] ?? [];
          const listed = grouped[path];
          const listedIds = new Set(listed.map((thread) => thread.id));
          // Chats without a first turn are not on disk yet — keep ours.
          merged[path] = sortThreads([...listed, ...known.filter((thread) => !listedIds.has(thread.id))]);
        }
        return { threadsByPath: { ...state.threadsByPath, ...merged } };
      });
    } finally {
      set((state) => ({
        loadingPaths: { ...state.loadingPaths, ...Object.fromEntries(unique.map((path) => [path, false])) },
      }));
    }
  },
  createThread: async (path) => {
    const threadId = await cursorCreateChat(path);
    const now = Math.floor(Date.now() / 1000);
    const thread: AgentThreadSummary = {
      id: threadId,
      path,
      title: "Neue Unterhaltung",
      preview: "",
      createdAt: now,
      updatedAt: now,
      status: "idle",
      modelProvider: "cursor",
    };
    set((state) => ({
      threadsByPath: { ...state.threadsByPath, [path]: sortThreads([thread, ...(state.threadsByPath[path] ?? [])]) },
      conversations: { ...state.conversations, [threadId]: emptyConversation(thread) },
      activeThreadByPath: { ...state.activeThreadByPath, [path]: threadId },
    }));
    return threadId;
  },
  openThread: async (path, threadId) => {
    set((state) => ({ activeThreadByPath: { ...state.activeThreadByPath, [path]: threadId } }));
    if (get().conversations[threadId]) return;
    const thread = get().threadsByPath[path]?.find((candidate) => candidate.id === threadId) ?? {
      id: threadId,
      path,
      title: "Cursor-Unterhaltung",
      preview: "",
      createdAt: 0,
      updatedAt: 0,
      status: "idle",
      modelProvider: "cursor",
    };
    set((state) => ({ conversations: { ...state.conversations, [threadId]: emptyConversation(thread) } }));
  },
  sendMessage: async (path, text, attachments = []) => {
    let threadId = get().activeThreadByPath[path];
    if (!threadId) threadId = await get().createThread(path);
    const turnId = id("turn");
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      activeTurnId: turnId,
      error: null,
      turns: [
        ...conversation.turns,
        {
          id: turnId,
          items: [
            {
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
            },
          ],
          status: "inProgress",
          startedAt: Date.now(),
        },
      ],
    }));
    set((state) => ({
      threadsByPath: {
        ...state.threadsByPath,
        [path]: sortThreads(
          (state.threadsByPath[path] ?? []).map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  preview: thread.preview || text,
                  title: thread.title === "Neue Unterhaltung" ? text.slice(0, 80) || thread.title : thread.title,
                  updatedAt: Math.floor(Date.now() / 1000),
                }
              : thread,
          ),
        ),
      },
    }));
    try {
      await runTurn(threadId, path, promptText(text, attachments));
    } catch (error) {
      updateConversation(threadId, (conversation) => ({
        ...conversation,
        activeTurnId: null,
        error: errorMessage(error),
        turns: conversation.turns.filter((turn) => turn.id !== turnId),
      }));
      throw error;
    }
  },
  steerMessage: async (threadId, text, attachments = []) => {
    const conversation = get().conversations[threadId];
    if (!conversation) throw new Error("Cursor-Unterhaltung wurde nicht gefunden.");
    if (conversation.activeTurnId) {
      throw new Error("Cursor kann einen laufenden Turn nicht steuern — bitte erst stoppen.");
    }
    await get().sendMessage(conversation.path, text, attachments);
  },
  interrupt: async (threadId) => {
    await clients.get(threadId)?.interrupt();
    updateConversation(threadId, (conversation) => {
      const next = applyToActiveTurn(conversation, (turn) => ({ ...turn, status: "interrupted" }));
      rememberTranscript(threadId, next.turns);
      return { ...next, activeTurnId: null };
    });
  },
  respondToRequest: async () => {},
  rejectUnsupportedRequest: async () => {},
  archiveThread: async (path, threadId) => {
    prefs.archived.add(threadId);
    savePrefs();
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
    }));
  },
  unarchiveThread: async (path, threadId) => {
    prefs.archived.delete(threadId);
    savePrefs();
    set((state) => ({
      threadsByPath: {
        ...state.threadsByPath,
        [path]: sortThreads(
          (state.threadsByPath[path] ?? []).map((thread) =>
            thread.id === threadId ? { ...thread, archived: false } : thread,
          ),
        ),
      },
    }));
  },
  deleteThread: async (path, threadId) => {
    await clients.get(threadId)?.close().catch(() => {});
    clients.delete(threadId);
    await invoke("cursor_delete_session", { sessionId: threadId });
    prefs.pinned.delete(threadId);
    prefs.archived.delete(threadId);
    savePrefs();
    transcripts.delete(threadId);
    saveTranscripts();
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
    await invoke("cursor_rename_session", { sessionId: threadId, title: name });
    set((state) => ({
      threadsByPath: {
        ...state.threadsByPath,
        [path]: (state.threadsByPath[path] ?? []).map((thread) =>
          thread.id === threadId ? { ...thread, title: name } : thread,
        ),
      },
      conversations: state.conversations[threadId]
        ? { ...state.conversations, [threadId]: { ...state.conversations[threadId], title: name } }
        : state.conversations,
    }));
  },
  setThreadPinned: async (path, threadId, isPinned) => {
    if (isPinned) prefs.pinned.add(threadId);
    else prefs.pinned.delete(threadId);
    savePrefs();
    set((state) => ({
      threadsByPath: {
        ...state.threadsByPath,
        [path]: sortThreads(
          (state.threadsByPath[path] ?? []).map((thread) =>
            thread.id === threadId ? { ...thread, isPinned } : thread,
          ),
        ),
      },
    }));
  },
  startReview: async (threadId, instructions) => {
    const conversation = get().conversations[threadId];
    if (!conversation) throw new Error("Cursor-Unterhaltung wurde nicht gefunden.");
    await get().sendMessage(
      conversation.path,
      instructions
        ? `Review die aktuellen Änderungen: ${instructions}`
        : "Review die aktuellen Änderungen im Arbeitsverzeichnis.",
    );
  },
  compactThread: async (threadId) => {
    const conversation = get().conversations[threadId];
    if (!conversation) throw new Error("Cursor-Unterhaltung wurde nicht gefunden.");
    await get().sendMessage(conversation.path, "Fasse den bisherigen Verlauf kompakt zusammen.");
  },
  forkThread: async (path, threadId) => {
    const forkId = await cursorCreateChat(path);
    const original = get().threadsByPath[path]?.find((thread) => thread.id === threadId);
    const now = Math.floor(Date.now() / 1000);
    const fork: AgentThreadSummary = {
      id: forkId,
      path,
      title: `${original?.title ?? "Unterhaltung"} (Fork)`,
      preview: original?.preview ?? "",
      createdAt: now,
      updatedAt: now,
      status: "idle",
      modelProvider: "cursor",
    };
    set((state) => ({
      threadsByPath: { ...state.threadsByPath, [path]: sortThreads([fork, ...(state.threadsByPath[path] ?? [])]) },
      conversations: { ...state.conversations, [forkId]: emptyConversation(fork) },
      activeThreadByPath: { ...state.activeThreadByPath, [path]: forkId },
    }));
    return forkId;
  },
  listSkills: async (path) => {
    const files = await repoFiles(path).catch((): string[] => []);
    return files
      .flatMap((file): AgentSkill[] => {
        const kind = /(^|\/)\.cursor\/rules\/.+\.mdc?$/u.test(file)
          ? "Cursor Rule"
          : /(^|\/)\.cursor\/commands\/.+\.md$/u.test(file)
            ? "Cursor Command"
            : /(^|\/)\.cursor\/skills\/[^/]+\/SKILL\.md$/u.test(file)
              ? "Cursor Skill"
              : null;
        if (!kind) return [];
        const segments = file.split("/");
        const name =
          kind === "Cursor Skill"
            ? segments[segments.length - 2]
            : (segments.pop() ?? file).replace(/\.mdc?$/u, "");
        return [{ name, description: kind, path: file, enabled: true }];
      });
  },
  loadPermissionProfiles: async (path) => {
    set({ permissionProfiles, permissionProfilesPath: path });
    await warmCursorModelCatalog(path);
  },
  listApps: async () => [],
  listMcpServers: async (threadId) => {
    const cwd = threadId ? get().conversations[threadId]?.path : undefined;
    const output = await cursorCli(["mcp", "list"], cwd).catch(() => "");
    return parseCursorMcpServers(output).map(
      (server): AgentMcpServer => ({ name: server.name, tools: [], authStatus: server.status }),
    );
  },
  loginMcpServer: async (name, threadId) => {
    const cwd = threadId ? get().conversations[threadId]?.path : undefined;
    await cursorCli(["mcp", "login", name], cwd);
    return "";
  },
  searchFiles: async (path, query) => {
    const files = await repoFiles(path);
    const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    return files
      .filter((file) => terms.every((term) => file.toLocaleLowerCase().includes(term)))
      .slice(0, 200)
      .map((file, index): AgentFileMatch => ({
        root: path,
        path: file,
        fileName: file.split(/[\\/]/u).pop() ?? file,
        score: 200 - index,
      }));
  },
  listHooks: async (path) => invoke<AgentHook[]>("cursor_list_hooks", { path }).catch(() => []),
  listPlugins: async (path) => {
    const output = await cursorCli(["plugin", "marketplace", "list"], path).catch(() => "");
    return output
      .split("\n")
      .map((line) => line.trim().replace(/^[-•*]\s*/u, ""))
      .filter((line) => /^[\w@./-]+$/u.test(line))
      .map((line) => ({
        id: line,
        name: line.split("@")[0],
        installed: true,
        enabled: true,
        availability: "user",
      }));
  },
  detectExternalAgentConfig: async () => [],
  listExternalAgentConfigImportHistories: async () => [],
  importExternalAgentConfig: async () => [],
  sendFeedback: async () => {
    throw new Error("Die Cursor CLI nimmt kein Feedback über l8git entgegen.");
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
  setModel: (model) => set({ model }),
  setReasoningEffort: () => {},
  setServiceTier: (serviceTier) => set({ serviceTier }),
  setPersonality: (personality) => set({ personality }),
  setCollaborationMode: (collaborationMode) =>
    set({
      collaborationMode,
      permissionProfile:
        collaborationMode === "plan" ? "plan" : get().permissionProfile === "plan" ? "force" : get().permissionProfile,
    }),
  setPermissionProfile: (permissionProfile) => set({ permissionProfile }),
  setRealtimeVoice: (realtimeVoice) => set({ realtimeVoice }),
  setApprovalPolicy: (approvalPolicy) => set({ approvalPolicy, permissionProfile: null }),
  setSandboxMode: (sandboxMode) => set({ sandboxMode }),
  clearError: (threadId) => {
    if (!threadId) return set({ connectionError: null });
    updateConversation(threadId, (conversation) => ({ ...conversation, error: null }));
  },
}));

let lastSettings = "";
cursorChatStore.subscribe((state) => {
  const value = JSON.stringify({
    model: state.model,
    collaborationMode: state.collaborationMode,
    permissionProfile: state.permissionProfile,
    approvalPolicy: state.approvalPolicy,
    sandboxMode: state.sandboxMode,
  });
  if (value === lastSettings) return;
  lastSettings = value;
  kvSet(SETTINGS_KEY, value);
});
