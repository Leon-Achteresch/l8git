import { describe, expect, it } from "vitest";

import { claudeChatStore, handleClaudeMessage } from "@/lib/agents/providers/claude/chat-store";
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

describe("TASK-04 task_updated patches and completion", () => {
  it("merges a status patch without losing already-set fields, and distinguishes cancel from a result-less turn end", () => {
    const id = threadId(`task-04-${Math.random()}`) as unknown as string;
    seedConversation(id, { id: "turn-1", items: [], status: "inProgress" });

    handleClaudeMessage(id, "/repo", {
      type: "system",
      subtype: "task_started",
      task_id: "task-1",
      description: "Run migration",
      last_tool_name: "Bash",
    });

    let conv = claudeChatStore.getState().conversations[id];
    expect(conv.turns[0].items[0]).toMatchObject({ taskId: "task-1", lastToolName: "Bash", status: "inProgress" });

    handleClaudeMessage(id, "/repo", {
      type: "system",
      subtype: "task_updated",
      task_id: "task-1",
      status: "cancelled",
      end_time: "2026-09-10T00:00:00Z",
    });

    conv = claudeChatStore.getState().conversations[id];
    const task = conv.turns[0].items[0];
    // The patch must be merged in: the field set earlier by task_started
    // (lastToolName) must survive a later, unrelated status patch.
    expect(task).toMatchObject({
      status: "aborted",
      lastToolName: "Bash",
      endTime: "2026-09-10T00:00:00Z",
    });
    expect(task.result).toBeUndefined();

    // Once finalized, a later task_progress for the same task must not
    // reactivate it.
    handleClaudeMessage(id, "/repo", {
      type: "system",
      subtype: "task_progress",
      task_id: "task-1",
      summary: "still running?",
    });
    conv = claudeChatStore.getState().conversations[id];
    expect(conv.turns[0].items[0].status).toBe("aborted");
  });

  it("marks a task as completed on a natural turn end, not aborted like a cancel", () => {
    const id = threadId(`task-04-natural-${Math.random()}`) as unknown as string;
    seedConversation(id, { id: "turn-1", items: [], status: "inProgress" });

    handleClaudeMessage(id, "/repo", {
      type: "system",
      subtype: "task_started",
      task_id: "task-1",
      description: "Run migration",
    });

    handleClaudeMessage(id, "/repo", {
      type: "system",
      subtype: "task_updated",
      task_id: "task-1",
      status: "completed",
      end_time: "2026-09-10T00:00:00Z",
    });

    const conv = claudeChatStore.getState().conversations[id];
    expect(conv.turns[0].items[0]).toMatchObject({ status: "completed", endTime: "2026-09-10T00:00:00Z" });
  });
});
