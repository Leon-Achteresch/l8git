import { isRepoAgentsTrusted } from "@/lib/agent-trust-prefs";
import { invoke } from "@/lib/platform/ipc";
import { ClaudeClient } from "@/lib/agents/providers/claude/client";
import type { AgentHook, AgentMcpServer, AgentSkill } from "@/lib/agents/types";

import { isRecord, stringValue, arrayValue } from "@/lib/agents/chat/values";
import { claudeChatStore } from "@/lib/agents/providers/claude/chat-store";
import {
  type ClaudeSessionSummary,
  type ClaudeSessionTranscript,
  MAX_REPO_FILE_CACHES,
  MAX_THREAD_LIST_CACHES,
  MAX_WARM_CLIENTS,
  REPO_FILE_CACHE_MS,
  THREAD_LIST_CACHE_MS,
  capabilityPromises,
  catalogWarmups,
  clientConnectPromises,
  clientLastUsed,
  clients,
  hooksByPath,
  mcpByPath,
  pendingForkSources,
  persistedSessions,
  repoFileCache,
  repoFilePromises,
  runtimeState,
  skillsByPath,
  threadListCache,
  threadListPromises,
  transcriptPromises,
} from "@/lib/agents/providers/claude/chat/state";
import { permissionMode, updateCapabilities } from "@/lib/agents/providers/claude/chat/runtime";
import { handleClaudeMessage, handleControlRequest } from "@/lib/agents/providers/claude/chat/messages";

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
      finalizeThreadExit(threadId, code);
    },
  });
  clients.set(threadId, client);
  clientLastUsed.set(threadId, Date.now());
  try {
    const state = claudeChatStore.getState();
    const pendingForkSource = pendingForkSources.get(threadId);
    const storedCursor = runtimeState.resumeCursors[threadId];
    const shouldResume = resume ?? (persistedSessions.has(threadId) || Boolean(pendingForkSource) || Boolean(storedCursor));
    const shouldFork = forkSession ?? Boolean(pendingForkSource);
    const sourceSessionId = resumeSessionId ?? pendingForkSource ?? storedCursor?.nativeSessionId ?? threadId;
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

export function ensureClient(
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

export async function loadCapabilities(path: string) {
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

export function loadSessionList(paths: string[]): Promise<ClaudeSessionSummary[]> {
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

export function loadTranscript(path: string, threadId: string): Promise<ClaudeSessionTranscript> {
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

export function loadRepoFiles(path: string): Promise<Array<{ path: string; lowerPath: string; fileName: string }>> {
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

export function finalizeThreadExit(threadId: string, code: number): void {
  claudeChatStore.setState((state) => ({
    sessionStatusByThread: { ...state.sessionStatusByThread, [threadId]: code === 0 ? "idle" : "error" },
    requestsByThread: state.requestsByThread[threadId]?.length
      ? { ...state.requestsByThread, [threadId]: [] }
      : state.requestsByThread,
  }));
}

export function removeRequest(threadId: string, requestId: string | number) {
  claudeChatStore.setState((state) => ({
    requestsByThread: {
      ...state.requestsByThread,
      [threadId]: (state.requestsByThread[threadId] ?? []).filter((request) => request.requestId !== requestId),
    },
  }));
}
