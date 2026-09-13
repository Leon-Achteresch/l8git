import { describe, expect, it } from "vitest";

import { claudeChatStore, handleClaudeMessage } from "@/lib/agents/providers/claude/chat-store";
import { useUsageLedgerStore } from "@/lib/agents/usage-ledger";
import { threadId } from "@/lib/agents/types";
import type { AgentConversation, AgentTurn } from "@/lib/agents/types";

function seedConversation(id: string, turn: AgentTurn): void {
  claudeChatStore.setState((state) => ({
    conversations: {
      ...state.conversations,
      [id]: {
        threadId: id,
        path: "/repo",
        title: "t",
        model: "claude-sonnet-4",
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

describe("TASK-06 subagent usage booking without double counting", () => {
  it("books Task tool usage on its own ledger key and keeps it out of the main turn's usage sum", () => {
    const id = threadId(`task-06-${Math.random()}`) as unknown as string;
    seedConversation(id, { id: "turn-1", items: [], status: "inProgress" });

    handleClaudeMessage(id, "/repo", {
      type: "assistant",
      uuid: "asst-1",
      message: {
        id: "asst-1",
        model: "claude-sonnet-4",
        content: [{ type: "tool_use", id: "tu-task-1", name: "Task", input: { description: "Investigate" } }],
      },
    });

    const before = useUsageLedgerStore.getState().threads[`${id}:task:tu-task-1`];
    expect(before).toBeUndefined();

    handleClaudeMessage(id, "/repo", {
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "tu-task-1", is_error: false, content: "done" }],
      },
      toolUseResult: {
        usage: { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    });

    const conv = claudeChatStore.getState().conversations[id];
    expect(conv.turns[0].items[0]).toMatchObject({ status: "completed" });
    // The subagent tokens must not be folded into the main turn/conversation total.
    expect(conv.tokenUsage).toBeUndefined();

    const booked = useUsageLedgerStore.getState().threads[`${id}:task:tu-task-1`];
    expect(booked).toMatchObject({ inputTokens: 500, outputTokens: 100 });

    // Replaying the same tool_result frame must not double-book the usage.
    handleClaudeMessage(id, "/repo", {
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "tu-task-1", is_error: false, content: "done" }],
      },
      toolUseResult: {
        usage: { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    });
    const bookedAgain = useUsageLedgerStore.getState().threads[`${id}:task:tu-task-1`];
    expect(bookedAgain?.inputTokens).toBe(500);
  });
});
