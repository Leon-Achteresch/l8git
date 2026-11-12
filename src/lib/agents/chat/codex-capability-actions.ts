import type {
  AgentApp,
  AgentExternalConfigImportTypeResult,
  AgentMcpServer,
  AgentPermissionProfile,
  AgentPlugin,
  AgentThreadSummary,
} from "@/lib/agents/types";
import { codexSessionManager } from "@/lib/agents/session-manager";
import type { StoreApi } from "zustand";

import { stringValue, sortThreadSummaries } from "@/lib/agents/chat/values";
import type { AgentChatState } from "@/lib/agents/chat-store";
import { externalImportNotification } from "@/lib/agents/chat/codex-normalize";
import {
  appsCache,
  appsPromises,
  fileSearchCache,
  fileSearchPromises,
  permissionProfilePromises,
  skillsCache,
  skillsPromises,
} from "@/lib/agents/chat/codex-state";

export const codexCapabilityActions = (
  set: StoreApi<AgentChatState>["setState"],
  get: StoreApi<AgentChatState>["getState"],
) => ({
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
} satisfies Partial<AgentChatState>);
