import { invoke } from "@/lib/platform/ipc";
import type { AgentChatState } from "@/lib/agents/chat-store";
import { saveResumeCursors } from "@/lib/agents/resume-cursor";
import type {
  AgentFileMatch,
  AgentHook,
  AgentMcpServer,
  AgentPlugin,
  AgentThreadSummary,
} from "@/lib/agents/types";
import type { StoreApi } from "zustand/vanilla";

import {
  isRecord,
  stringValue,
  arrayValue,
  sortThreadSummaries as sortThreads,
} from "@/lib/agents/chat/values";
import {
  type UnknownRecord,
  bookedSubagentUsage,
  clientConnectPromises,
  clientLastUsed,
  clients,
  conversationLastUsed,
  eventSequenceByThread,
  hooksByPath,
  mcpByPath,
  pendingForkSources,
  permissionProfiles,
  persistedSessions,
  runtimeState,
  saveSessionPrefs,
  sessionPrefs,
  skillsByPath,
  streamEventsByThread,
} from "@/lib/agents/providers/claude/chat/state";
import {
  activeThreadClient,
  cacheConversation,
  permissionMode,
  updateConversation,
} from "@/lib/agents/providers/claude/chat/runtime";
import {
  ensureClient,
  loadCapabilities,
  loadRepoFiles,
  warmClaudeModelCatalog,
} from "@/lib/agents/providers/claude/chat/connect";
import { clearThreadSuggestions, messageQueues } from "@/lib/agents/providers/claude/chat/queue";

export const claudeSessionActions = (
  set: StoreApi<AgentChatState>["setState"],
  get: StoreApi<AgentChatState>["getState"],
) => ({
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
    if (runtimeState.resumeCursors[threadId]) {
      const { [threadId]: _removed, ...rest } = runtimeState.resumeCursors;
      runtimeState.resumeCursors = rest;
      saveResumeCursors(runtimeState.resumeCursors);
    }
    messageQueues.delete(threadId);
    clearThreadSuggestions(threadId);
    eventSequenceByThread.delete(threadId);
    for (const key of bookedSubagentUsage) {
      if (key.startsWith(`${threadId}:`)) bookedSubagentUsage.delete(key);
    }
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
    // Stop each task independently; one already-finished task must not
    // block or fail the stop of the remaining ones.
    await Promise.all(tasks.map((task) =>
      client?.request("stop_task", { task_id: task.processId }).catch(() => null)));
  },
  terminateBackgroundTerminal: async (threadId, processId) => {
    const client = clients.get(threadId);
    if (!client) return false;
    try {
      await client.request("stop_task", { task_id: processId });
      return true;
    } catch {
      // The task may already have ended on its own (race with natural
      // completion) or the driver may not support targeted stop; treat
      // this as "no longer running" instead of retrying forever.
      return false;
    }
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
    const client = activeThreadClient();
    void client?.setModel(model).catch(() => {});
  },
  setReasoningEffort: (reasoningEffort) => {
    set({ reasoningEffort });
    const tokens = ({ low: 2_048, medium: 8_192, high: 16_384, xhigh: 32_768, max: 64_000 } as Record<string, number>)[reasoningEffort] ?? 16_384;
    const client = activeThreadClient();
    void client?.setMaxThinkingTokens(tokens).catch(() => {});
  },
  setServiceTier: (serviceTier) => set({ serviceTier }),
  setPersonality: (personality) => set({ personality }),
  setCollaborationMode: (collaborationMode) => {
    set({ collaborationMode, permissionProfile: collaborationMode === "plan" ? "plan" : get().permissionProfile === "plan" ? "default" : get().permissionProfile });
    const client = activeThreadClient();
    void client?.setPermissionMode(permissionMode()).catch(() => {});
  },
  setPermissionProfile: (permissionProfile) => {
    set({ permissionProfile });
    const client = activeThreadClient();
    void client?.setPermissionMode(permissionMode()).catch(() => {});
  },
  setRealtimeVoice: (realtimeVoice) => set({ realtimeVoice }),
  setApprovalPolicy: (approvalPolicy) => {
    set({ approvalPolicy, permissionProfile: null });
    const client = activeThreadClient();
    void client?.setPermissionMode(permissionMode()).catch(() => {});
  },
  setSandboxMode: (sandboxMode) => {
    set({ sandboxMode, permissionProfile: null });
    const client = activeThreadClient();
    void client?.setPermissionMode(permissionMode()).catch(() => {});
  },
  clearError: (threadId) => {
    if (!threadId) return set({ connectionError: null });
    updateConversation(threadId, (conversation) => ({ ...conversation, error: null }));
  },
} satisfies Partial<AgentChatState>);
