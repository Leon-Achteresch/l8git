import type { AgentChatState } from "@/lib/agents/chat-store";
import { conversationDiffPatch, keepThreadDiff } from "@/lib/agents/thread-diff";
import type { AgentAttachment, AgentThreadSummary } from "@/lib/agents/types";
import type { StoreApi } from "zustand/vanilla";

import {
  isRecord,
  stringValue,
  arrayValue,
  errorMessage,
  sortThreadSummaries as sortThreads,
} from "@/lib/agents/chat/values";
import { claudeChatStore } from "@/lib/agents/providers/claude/chat-store";
import {
  type UnknownRecord,
  clients,
  conversationLastUsed,
  pendingForkSources,
  persistResumeCursor,
  persistedSessions,
  rateLimitBucketsByThread,
  runtimeState,
  sessionPrefs,
} from "@/lib/agents/providers/claude/chat/state";
import { id, summary, transcriptConversation } from "@/lib/agents/providers/claude/chat/transcript";
import {
  cacheConversation,
  emptyConversation,
  leavePlanMode,
  updateConversation,
} from "@/lib/agents/providers/claude/chat/runtime";
import {
  ensureClient,
  loadSessionList,
  loadTranscript,
  removeRequest,
} from "@/lib/agents/providers/claude/chat/connect";

export const claudeThreadActions = (
  set: StoreApi<AgentChatState>["setState"],
  get: StoreApi<AgentChatState>["getState"],
) => ({
  loadThreads: async (paths) => {
    const unique = [...new Set(paths.filter(Boolean))];
    if (unique.length === 0) return;
    set((state) => ({ loadingPaths: { ...state.loadingPaths, ...Object.fromEntries(unique.map((path) => [path, true])) } }));
    try {
      const values = await loadSessionList(unique);
      values.forEach((thread) => { persistedSessions.add(thread.id); });
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
      set((state) => {
        const merged: Record<string, AgentThreadSummary[]> = {};
        for (const path of unique) {
          const previous = new Map(
            (state.threadsByPath[path] ?? []).map((thread) => [thread.id, thread]),
          );
          merged[path] = sortThreads(
            (grouped[path] ?? []).map((thread) => keepThreadDiff(thread, previous.get(thread.id))),
          );
        }
        return { threadsByPath: { ...state.threadsByPath, ...merged } };
      });
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
      set((state) => {
        const conversation = transcriptConversation(transcript);
        return {
          conversations: cacheConversation(state, threadId, conversation),
          threadsByPath:
            conversationDiffPatch(state.threadsByPath, conversation) ?? state.threadsByPath,
        };
      });
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
    persistResumeCursor(threadId, runtimeState.resumeCursors[threadId]?.nativeSessionId ?? threadId);
    rateLimitBucketsByThread.delete(threadId);
    updateConversation(threadId, (conversation) => ({
      ...conversation,
      activeTurnId: null,
      turns: conversation.turns.map((turn) => turn.id === conversation.activeTurnId ? {
        ...turn,
        status: "interrupted",
        completedAt: Date.now(),
        items: turn.items.map((item) => item.status === "inProgress" || item.status === "pending"
          ? { ...item, status: "aborted" }
          : item),
      } : turn),
    }));
    claudeChatStore.setState((state) => ({
      requestsByThread: state.requestsByThread[threadId]?.length
        ? { ...state.requestsByThread, [threadId]: [] }
        : state.requestsByThread,
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
      leavePlanMode(decision === "acceptEdits", request.threadId);
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
} satisfies Partial<AgentChatState>);
