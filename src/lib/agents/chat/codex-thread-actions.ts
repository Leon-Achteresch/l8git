import { type CodexThread } from "@/lib/agents/providers/codex/protocol";
import { codexSessionManager } from "@/lib/agents/session-manager";
import { conversationDiffPatch, keepThreadDiff } from "@/lib/agents/thread-diff";
import i18n from "@/lib/i18n";
import type { StoreApi } from "zustand";

import { errorMessage, sortThreadSummaries } from "@/lib/agents/chat/values";
import type { AgentChatState } from "@/lib/agents/chat-store";
import {
  conversationFromRuntime,
  isMissingRolloutError,
  threadSummary,
} from "@/lib/agents/chat/codex-normalize";
import { attachListeners } from "@/lib/agents/chat/codex-events";
import { CODEX_THREAD_LIST_PAGES } from "@/lib/agents/chat/codex-state";

export const codexThreadActions = (
  set: StoreApi<AgentChatState>["setState"],
  get: StoreApi<AgentChatState>["getState"],
) => ({
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

        attachListeners();
        const client = await codexSessionManager.controlClient();
        try {
          const results = await Promise.all(unique.map(async (path) => {
            const trackedIds = trackedIdsByPath.get(path) ?? new Set<string>();
            const found = new Map<string, CodexThread>();
            let cursor: string | null = null;
            let pages = 0;
            do {
              const response = await client.listThreads(path, cursor);
              for (const thread of response.data) found.set(thread.id, thread);
              cursor = response.nextCursor;
              pages += 1;
            } while (cursor && pages < CODEX_THREAD_LIST_PAGES);
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
              const listedIds = new Set(threads.map((thread) => thread.id));
              const newThreads = (state.threadsByPath[path] ?? []).filter(
                (thread) => !trackedIds.has(thread.id) && !listedIds.has(thread.id),
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
} satisfies Partial<AgentChatState>);
