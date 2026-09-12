import { describe, expect, it } from "vitest";

import {
  classifyResultErrorCategory,
  claudeChatStore,
  handleClaudeMessage,
} from "@/lib/agents/providers/claude/chat-store";
import type { AgentConversation, AgentTurn } from "@/lib/agents/types";

function seedConversation(id: string, turn: AgentTurn): void {
  claudeChatStore.setState((state) => ({
    conversations: {
      ...state.conversations,
      [id]: {
        threadId: id,
        path: "/repo",
        title: "t",
        model: "",
        reasoningEffort: null,
        collaborationMode: "default",
        approvalPolicy: "on-request",
        sandboxMode: "read-only",
        turns: [turn],
        activeTurnId: turn.id,
        loading: false,
        error: null,
      } as AgentConversation,
    },
  }));
}

describe("classifyResultErrorCategory", () => {
  it("distinguishes auth, overload and unknown causes", () => {
    expect(classifyResultErrorCategory("", "401 expired auth credential")).toBe("auth");
    expect(classifyResultErrorCategory("529", null)).toBe("overload");
    expect(classifyResultErrorCategory("weird_terminal_reason", null)).toBe("unknown");
  });
});

describe("EVT-11 result event handling", () => {
  it("classifies a failed result with a terminal error category", () => {
    const threadId = "evt-11-thread";
    const turn: AgentTurn = { id: "turn-1", items: [], status: "inProgress" };
    seedConversation(threadId, turn);

    handleClaudeMessage(threadId, "/repo", {
      type: "result",
      is_error: true,
      terminal_reason: "overloaded_error",
      result: "the model is overloaded (529)",
    });

    const updated = claudeChatStore.getState().conversations[threadId].turns[0];
    expect(updated.status).toBe("failed");
    expect((updated as unknown as { errorCategory?: string }).errorCategory).toBe("overload");
  });

  it("does not fabricate a completion when there is no active turn", () => {
    const threadId = "evt-11-no-active";
    const turn: AgentTurn = { id: "turn-1", items: [], status: "completed" };
    seedConversation(threadId, turn);
    claudeChatStore.setState((state) => ({
      conversations: {
        ...state.conversations,
        [threadId]: { ...state.conversations[threadId], activeTurnId: null },
      },
    }));

    handleClaudeMessage(threadId, "/repo", { type: "result", is_error: false });

    const updated = claudeChatStore.getState().conversations[threadId].turns[0];
    expect(updated.status).toBe("completed");
  });

  it("does not let a later benign result overwrite an already-set terminal error", () => {
    const threadId = "evt-11-no-overwrite";
    const turn: AgentTurn = { id: "turn-1", items: [], status: "failed", error: "boom" };
    seedConversation(threadId, turn);

    handleClaudeMessage(threadId, "/repo", { type: "result", is_error: false });

    const updated = claudeChatStore.getState().conversations[threadId].turns[0];
    expect(updated.status).toBe("failed");
    expect(updated.error).toBe("boom");
  });
});
