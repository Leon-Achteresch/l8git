import { describe, expect, it } from "vitest";

import { claudeChatStore, handleClaudeMessage, toolItem } from "@/lib/agents/providers/claude/chat-store";
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

describe("TASK-03 subagent progress vs result", () => {
  it("records summary, last_tool_name and output as progress separate from the final result", () => {
    const id = threadId(`task-progress-${Math.random()}`) as unknown as string;
    const taskCard = toolItem({ type: "tool_use", name: "Task", id: "tu-task-1", input: { description: "Run tests" } }, "item-0");
    seedConversation(id, { id: "turn-1", items: [taskCard], status: "inProgress" });

    handleClaudeMessage(id, "/repo", {
      type: "system",
      subtype: "task_progress",
      parent_tool_use_id: "tu-task-1",
      summary: "Running unit tests",
      last_tool_name: "Bash",
      output: "12 passed",
    });

    const conv = claudeChatStore.getState().conversations[id];
    const item = conv.turns[0].items[0];
    expect(item.status).toBe("inProgress");
    expect(item.lastToolName).toBe("Bash");
    expect(item.progressLog).toEqual([{ summary: "Running unit tests", lastToolName: "Bash", output: "12 passed" }]);
    expect(item.result).toBeUndefined();

    handleClaudeMessage(id, "/repo", {
      type: "system",
      subtype: "task_notification",
      parent_tool_use_id: "tu-task-1",
      output: "All tests green",
    });
    const finished = claudeChatStore.getState().conversations[id].turns[0].items[0];
    expect(finished.result).toBe("All tests green");
    expect(finished.progressLog).toHaveLength(1);
  });

  it("respects skip_transcript by omitting output that was never delivered", () => {
    const id = threadId(`task-progress-skip-${Math.random()}`) as unknown as string;
    const taskCard = toolItem({ type: "tool_use", name: "Task", id: "tu-task-2", input: { description: "Silent task" } }, "item-0");
    seedConversation(id, { id: "turn-1", items: [taskCard], status: "inProgress" });

    handleClaudeMessage(id, "/repo", {
      type: "system",
      subtype: "task_progress",
      parent_tool_use_id: "tu-task-2",
      summary: "Working",
      skip_transcript: true,
      output: "hidden output",
    });

    const item = claudeChatStore.getState().conversations[id].turns[0].items[0];
    expect(item.progressLog).toEqual([{ summary: "Working", lastToolName: "", output: undefined }]);
  });

  it("does not let a late progress event reactivate an already completed task", () => {
    const id = threadId(`task-progress-late-${Math.random()}`) as unknown as string;
    const taskCard = toolItem({ type: "tool_use", name: "Task", id: "tu-task-3", input: { description: "Fast task" } }, "item-0");
    seedConversation(id, { id: "turn-1", items: [taskCard], status: "inProgress" });

    handleClaudeMessage(id, "/repo", {
      type: "system",
      subtype: "task_updated",
      parent_tool_use_id: "tu-task-3",
      status: "completed",
    });
    let item = claudeChatStore.getState().conversations[id].turns[0].items[0];
    expect(item.status).toBe("completed");

    handleClaudeMessage(id, "/repo", {
      type: "system",
      subtype: "task_progress",
      parent_tool_use_id: "tu-task-3",
      summary: "Late update",
    });
    item = claudeChatStore.getState().conversations[id].turns[0].items[0];
    expect(item.status).toBe("completed");
    expect(item.progressLog ?? []).toHaveLength(0);
  });
});
