import { describe, expect, it } from "vitest";

import {
  claudeChatStore,
  handleClaudeMessage,
} from "@/lib/agents/providers/claude/chat-store";
import { shouldAutoResume } from "@/lib/agents/rate-limits";
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

describe("USE-08 CLI-native retries", () => {
  it("surfaces attempt, delay and category on the turn without an app-level resend", () => {
    const threadId = "use-08-thread";
    const turn: AgentTurn = { id: "turn-1", items: [], status: "inProgress" };
    seedConversation(threadId, turn);

    handleClaudeMessage(threadId, "/repo", {
      type: "system",
      subtype: "api_retry",
      attempt: 2,
      delay_ms: 1500,
      reason: "overloaded_error",
    });

    const updated = claudeChatStore.getState().conversations[threadId].turns[0] as unknown as {
      status: string;
      retry?: { attempt: number; delayMs: number; category: string };
    };
    expect(updated.status).toBe("inProgress");
    expect(updated.retry).toEqual(expect.objectContaining({ attempt: 2, delayMs: 1500, category: "overload" }));
  });
});

describe("USE-08 auto-resume gating", () => {
  it("only allows one auto-resume attempt per turn", () => {
    const attempted = new Set<string>();
    expect(shouldAutoResume(attempted, "turn-1")).toBe(true);
    attempted.add("turn-1");
    expect(shouldAutoResume(attempted, "turn-1")).toBe(false);
    expect(shouldAutoResume(attempted, "turn-2")).toBe(true);
  });
});
