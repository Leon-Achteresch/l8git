import { sandboxPolicyFor } from "@/lib/agents/providers/codex/client";
import { type CodexUserInput } from "@/lib/agents/providers/codex/protocol";
import type { AgentItem, AgentTurn } from "@/lib/agents/types";
import { codexSessionManager } from "@/lib/agents/session-manager";
import type { StoreApi } from "zustand";

import { errorMessage, sortThreadSummaries } from "@/lib/agents/chat/values";
import type { AgentChatState } from "@/lib/agents/chat-store";
import {
  conversationFromRuntime,
  inputFromAttachment,
  threadSummary,
} from "@/lib/agents/chat/codex-normalize";
import { optimisticId, renameSequenceByThread } from "@/lib/agents/chat/codex-state";

export const codexTurnActions = (
  set: StoreApi<AgentChatState>["setState"],
  get: StoreApi<AgentChatState>["getState"],
) => ({
      sendMessage: async (path, text, attachments = []) => {
        let threadId = get().activeThreadByPath[path];
        if (!threadId) threadId = await get().createThread(path);
        let state = get();
        let conversation = state.conversations[threadId];
        if (!conversation) throw new Error("Unterhaltung konnte nicht geöffnet werden.");
        if (conversation.activeTurnId) {
          await get().steerMessage(threadId, text, attachments);
          return;
        }
        const { client, runtime } = await codexSessionManager.threadClient(threadId, path);
        if (runtime) {
          set((current) => ({
            conversations: {
              ...current.conversations,
              [threadId]: {
                ...conversationFromRuntime(runtime),
                goal: current.conversations[threadId]?.goal ?? null,
              },
            },
          }));
          state = get();
          conversation = state.conversations[threadId];
          if (!conversation) throw new Error("Unterhaltung konnte nicht geöffnet werden.");
        }
        const clientId = optimisticId("message");
        const turnId = optimisticId("turn");
        const input: CodexUserInput[] = [
          { type: "text", text, text_elements: [] },
          ...attachments.map(inputFromAttachment),
        ];
        const selectedCollaborationMode = state.collaborationModes.find(
          (option) => option.mode === state.collaborationMode,
        );
        const optimisticItem: AgentItem = {
          id: clientId,
          clientId,
          type: "userMessage",
          content: input,
        };
        const optimisticTurn: AgentTurn = {
          id: turnId,
          items: [optimisticItem],
          status: "inProgress",
          error: null,
          startedAt: Date.now() / 1000,
        };
        const firstTurn = conversation.turns.length === 0;
        const initialTitle = firstTurn
          ? (text.trim().split("\n")[0] || attachments[0]?.name || conversation.title).slice(0, 80)
          : conversation.title;
        set((current) => {
          return {
            conversations: {
              ...current.conversations,
              [threadId]: {
                ...current.conversations[threadId],
                title: initialTitle,
                turns: [...current.conversations[threadId].turns, optimisticTurn],
                activeTurnId: turnId,
                error: null,
              },
            },
            threadsByPath: {
              ...current.threadsByPath,
              [path]: sortThreadSummaries((current.threadsByPath[path] ?? []).map((summary) =>
                summary.id === threadId
                  ? {
                      ...summary,
                      title: initialTitle,
                      preview: firstTurn ? (text.trim() || attachments.map((item) => item.name).join(", ")).slice(0, 160) : summary.preview,
                      updatedAt: Math.floor(Date.now() / 1000),
                      status: "active",
                    }
                  : summary,
              )),
            },
          };
        });
        try {
          // Persist the instant local title in parallel. Starting the model turn
          // stays on the critical path; a naming failure never delays or fails it.
          const titleRequest = firstTurn
            ? client.renameThread(threadId, initialTitle).catch(() => undefined)
            : Promise.resolve(undefined);
          const response = await client.startTurn(threadId, input, clientId, {
            model: state.model ?? undefined,
            effort: state.reasoningEffort,
            approvalPolicy: state.approvalPolicy,
            sandboxPolicy: state.permissionProfile ? undefined : sandboxPolicyFor(state.sandboxMode),
            permissions: state.permissionProfile,
            serviceTier: state.serviceTier,
            personality: state.personality,
            collaborationMode: {
              mode: state.collaborationMode,
              settings: {
                model: selectedCollaborationMode?.model ?? state.model ?? conversation.model,
                reasoning_effort:
                  selectedCollaborationMode?.reasoningEffort ?? state.reasoningEffort,
                developer_instructions: null,
              },
            },
          });
          await titleRequest;
          set((current) => {
            const currentConversation = current.conversations[threadId];
            if (!currentConversation) return current;
            const turns = currentConversation.turns.map((turn) =>
              turn.id === turnId ? { ...turn, id: response.turn.id } : turn,
            );
            return {
              conversations: {
                ...current.conversations,
                [threadId]: { ...currentConversation, turns, activeTurnId: response.turn.id },
              },
            };
          });
        } catch (error) {
          set((current) => ({
            conversations: {
              ...current.conversations,
              [threadId]: {
                ...current.conversations[threadId],
                activeTurnId: null,
                error: errorMessage(error),
                turns: current.conversations[threadId].turns.map((turn) =>
                  turn.id === turnId ? { ...turn, status: "failed", error: errorMessage(error) } : turn,
                ),
              },
            },
          }));
          throw error;
        }
      },

      steerMessage: async (threadId, text, attachments = []) => {
        const conversation = get().conversations[threadId];
        const expectedTurnId = conversation?.activeTurnId;
        if (!expectedTurnId) throw new Error("Es gibt keinen laufenden Turn.");
        const sessionId = codexSessionManager.sessionIdForThread(threadId);
        const client = sessionId ? codexSessionManager.clientForSession(sessionId) : null;
        if (!client) throw new Error("Die laufende Codex-Session ist nicht mehr verbunden.");
        const clientId = optimisticId("message");
        const input: CodexUserInput[] = [
          { type: "text", text, text_elements: [] },
          ...attachments.map(inputFromAttachment),
        ];
        set((current) => ({
          conversations: {
            ...current.conversations,
            [threadId]: {
              ...current.conversations[threadId],
              turns: current.conversations[threadId].turns.map((turn) =>
                turn.id === expectedTurnId
                  ? {
                      ...turn,
                      items: [
                        ...turn.items,
                        { id: clientId, clientId, type: "userMessage", content: input, __queued: true },
                      ],
                    }
                  : turn,
              ),
            },
          },
        }));
        try {
          await client.steer(threadId, expectedTurnId, input, clientId);
        } catch (error) {
          set((current) => ({
            conversations: {
              ...current.conversations,
              [threadId]: {
                ...current.conversations[threadId],
                turns: current.conversations[threadId].turns.map((turn) => ({
                  ...turn,
                  items: turn.items.filter((item) => item.id !== clientId),
                })),
              },
            },
          }));
          throw error;
        }
      },

      interrupt: async (threadId) => {
        const turnId = get().conversations[threadId]?.activeTurnId;
        if (!turnId) return;
        const sessionId = codexSessionManager.sessionIdForThread(threadId);
        const client = sessionId ? codexSessionManager.clientForSession(sessionId) : null;
        if (!client) throw new Error("Die laufende Codex-Session ist nicht mehr verbunden.");
        await client.interrupt(threadId, turnId);
      },

      respondToRequest: async (request, result) => {
        const client = codexSessionManager.clientForSession(request.sessionId);
        if (!client) throw new Error("Diese Codex-Session ist nicht mehr verbunden.");
        await client.respond(request.requestId, result);
        codexSessionManager.resolveRequest(request.sessionId, request.requestId);
        set((state) => ({
          requestsByThread: {
            ...state.requestsByThread,
            [request.threadId]: (state.requestsByThread[request.threadId] ?? []).filter(
              (candidate) =>
                candidate.sessionId !== request.sessionId ||
                candidate.requestId !== request.requestId,
            ),
          },
        }));
      },

      rejectUnsupportedRequest: async (request) => {
        const client = codexSessionManager.clientForSession(request.sessionId);
        if (!client) throw new Error("Diese Codex-Session ist nicht mehr verbunden.");
        await client.declineUnknown(request.requestId);
        codexSessionManager.resolveRequest(request.sessionId, request.requestId);
        set((state) => ({
          requestsByThread: {
            ...state.requestsByThread,
            [request.threadId]: (state.requestsByThread[request.threadId] ?? []).filter(
              (candidate) =>
                candidate.sessionId !== request.sessionId ||
                candidate.requestId !== request.requestId,
            ),
          },
        }));
      },

      archiveThread: async (path, threadId) => {
        const client = await codexSessionManager.controlClient();
        try {
          await client.archiveThread(threadId);
        } finally {
          codexSessionManager.releaseControl();
        }
        await codexSessionManager.closeThread(threadId);
        if (get().visibleThreadId === threadId) codexSessionManager.setVisibleThread(null);
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
      },

      unarchiveThread: async (path, threadId) => {
        const client = await codexSessionManager.controlClient();
        try {
          await client.unarchiveThread(threadId);
        } finally {
          codexSessionManager.releaseControl();
        }
        set((state) => ({
          threadsByPath: {
            ...state.threadsByPath,
            [path]: sortThreadSummaries(
              (state.threadsByPath[path] ?? []).map((thread) =>
                thread.id === threadId ? { ...thread, archived: false } : thread,
              ),
            ),
          },
        }));
      },

      deleteThread: async (path, threadId) => {
        const client = await codexSessionManager.controlClient();
        try {
          await client.deleteThread(threadId);
        } finally {
          codexSessionManager.releaseControl();
        }
        await codexSessionManager.closeThread(threadId);
        if (get().visibleThreadId === threadId) codexSessionManager.setVisibleThread(null);
        set((state) => ({
          threadsByPath: {
            ...state.threadsByPath,
            [path]: (state.threadsByPath[path] ?? []).filter((thread) => thread.id !== threadId),
          },
          activeThreadByPath: {
            ...state.activeThreadByPath,
            [path]: state.activeThreadByPath[path] === threadId ? null : state.activeThreadByPath[path],
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
      },

      renameThread: async (path, threadId, name) => {
        const trimmed = name.trim().slice(0, 256);
        if (!trimmed) return;
        const before = get();
        const previousTitle = before.threadsByPath[path]?.find((thread) => thread.id === threadId)?.title;
        if (previousTitle === trimmed) return;
        const sequence = (renameSequenceByThread.get(threadId) ?? 0) + 1;
        renameSequenceByThread.set(threadId, sequence);
        set((state) => ({
          threadsByPath: {
            ...state.threadsByPath,
            [path]: (state.threadsByPath[path] ?? []).map((thread) =>
              thread.id === threadId ? { ...thread, title: trimmed } : thread,
            ),
          },
          conversations: state.conversations[threadId]
            ? {
                ...state.conversations,
                [threadId]: { ...state.conversations[threadId], title: trimmed },
              }
            : state.conversations,
        }));
        const client = await codexSessionManager.controlClient();
        try {
          await client.renameThread(threadId, trimmed);
        } catch (error) {
          if (renameSequenceByThread.get(threadId) === sequence && previousTitle) {
            set((state) => ({
              threadsByPath: {
                ...state.threadsByPath,
                [path]: (state.threadsByPath[path] ?? []).map((thread) =>
                  thread.id === threadId ? { ...thread, title: previousTitle } : thread,
                ),
              },
              conversations: state.conversations[threadId]
                ? {
                    ...state.conversations,
                    [threadId]: { ...state.conversations[threadId], title: previousTitle },
                  }
                : state.conversations,
            }));
          }
          throw error;
        } finally {
          codexSessionManager.releaseControl();
        }
      },

      setThreadPinned: async (path, threadId, isPinned) => {
        const client = await codexSessionManager.controlClient();
        let response: Awaited<ReturnType<typeof client.setThreadPinned>>;
        try {
          response = await client.setThreadPinned(threadId, isPinned);
        } finally {
          codexSessionManager.releaseControl();
        }
        const summary = threadSummary(response.thread);
        set((state) => ({
          threadsByPath: {
            ...state.threadsByPath,
            [path]: sortThreadSummaries(
              (state.threadsByPath[path] ?? []).map((thread) =>
                thread.id === threadId ? summary : thread,
              ),
            ),
          },
        }));
      },

      startReview: async (threadId, instructions) => {
        const conversation = get().conversations[threadId];
        if (!conversation) throw new Error("Unterhaltung konnte nicht geöffnet werden.");
        const { client } = await codexSessionManager.threadClient(threadId, conversation.path);
        await client.startReview(
          threadId,
          instructions?.trim()
            ? { type: "custom", instructions: instructions.trim() }
            : { type: "uncommittedChanges" },
        );
      },

      compactThread: async (threadId) => {
        const conversation = get().conversations[threadId];
        if (conversation?.activeTurnId) {
          throw new Error("Ein laufender Turn kann nicht komprimiert werden.");
        }
        if (!conversation) throw new Error("Unterhaltung konnte nicht geöffnet werden.");
        const { client } = await codexSessionManager.threadClient(threadId, conversation.path);
        await client.compactThread(threadId);
      },

      forkThread: async (path, threadId) => {
        const state = get();
        if (state.conversations[threadId]?.activeTurnId) {
          throw new Error("Ein laufender Turn kann nicht verzweigt werden.");
        }
        const { client } = await codexSessionManager.threadClient(threadId, path);
        const runtime = await client.forkThread(threadId, {
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
            [conversation.threadId]: "idle",
          },
        }));
        return conversation.threadId;
      },
} satisfies Partial<AgentChatState>);
