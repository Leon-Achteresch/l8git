import { describe, expect, it } from "vitest";

import { claudeChatStore, __claudeClientsForTests } from "@/lib/agents/providers/claude/chat-store";
import { loadResumeCursors } from "@/lib/agents/resume-cursor";
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

describe("CHAT-03 user abort", () => {
  it("marks the turn interrupted, aborts open items, and persists a resume cursor for the thread", async () => {
    const threadId = "chat-03-thread";
    __claudeClientsForTests.delete(threadId);
    const turn: AgentTurn = {
      id: "turn-1",
      items: [
        { id: "i1", type: "dynamicToolCall", tool: "Custom", toolUseId: "tu-1", status: "inProgress" },
        { id: "i2", type: "userQuestion", status: "pending" },
      ],
      status: "inProgress",
    };
    seedConversation(threadId, turn);

    await claudeChatStore.getState().interrupt(threadId);

    const conversation = claudeChatStore.getState().conversations[threadId];
    expect(conversation.activeTurnId).toBeNull();
    const updatedTurn = conversation.turns[0];
    expect(updatedTurn.status).toBe("interrupted");
    expect(updatedTurn.items[0].status).toBe("aborted");
    expect(updatedTurn.items[1].status).toBe("aborted");

    const cursors = loadResumeCursors();
    expect(cursors[threadId]?.nativeSessionId).toBe(threadId);
  });
});
