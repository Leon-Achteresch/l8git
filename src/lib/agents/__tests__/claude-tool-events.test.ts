import { describe, expect, it } from "vitest";

import {
  applyToolResult,
  claudeChatStore,
  editChanges,
  handleClaudeMessage,
  normalizeClaudeEvent,
  toolItem,
} from "@/lib/agents/providers/claude/chat-store";
import { driverKind, instanceId, nativeSessionId, threadId } from "@/lib/agents/types";
import type { AgentConversation, AgentTurn } from "@/lib/agents/types";

const context = {
  driver: driverKind("claude"),
  instance: instanceId("claude:default"),
  threadId: threadId("t-1"),
  nativeSessionId: nativeSessionId("native-1"),
  sequence: 1,
};

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

describe("EVT-05 tool results", () => {
  it("distinguishes is_error and does not let a late duplicate result clobber a finalized card", () => {
    const turn: AgentTurn = {
      id: "turn-1",
      items: [{ id: "i1", type: "dynamicToolCall", tool: "Custom", toolUseId: "tu-1", status: "inProgress" }],
      status: "inProgress",
    };
    const failed = applyToolResult(turn, { tool_use_id: "tu-1", is_error: true, content: "boom" });
    expect(failed.items[0].status).toBe("failed");
    expect(failed.items[0].error).toBe("boom");

    const duplicate = applyToolResult(failed, { tool_use_id: "tu-1", is_error: false, content: "ok" });
    expect(duplicate.items[0].status).toBe("failed");
    expect(duplicate.items[0].error).toBe("boom");
  });

  it("ignores a tool_result with no matching item instead of creating a foreign card", () => {
    const turn: AgentTurn = { id: "turn-1", items: [], status: "inProgress" };
    const next = applyToolResult(turn, { tool_use_id: "unknown", content: "x" });
    expect(next.items).toHaveLength(0);
  });
});

describe("EVT-07 file changes", () => {
  it("normalizes Write, Edit, MultiEdit and NotebookEdit into path + operation + diff", () => {
    const write = editChanges("Write", { file_path: "a.ts", content: "hi" });
    expect(write[0]).toMatchObject({ path: "a.ts", operation: "create" });

    const edit = editChanges("Edit", { file_path: "a.ts", old_string: "a", new_string: "b" });
    expect(edit[0]).toMatchObject({ path: "a.ts", operation: "edit" });

    const multi = editChanges("MultiEdit", {
      file_path: "a.ts",
      edits: [
        { old_string: "a", new_string: "b" },
        { old_string: "c", new_string: "d" },
      ],
    });
    expect(multi).toHaveLength(2);
    expect(multi.every((change) => change.path === "a.ts" && change.operation === "edit")).toBe(true);

    const notebook = editChanges("NotebookEdit", {
      notebook_path: "n.ipynb",
      edit_mode: "insert",
      old_source: "",
      new_source: "print(1)",
    });
    expect(notebook[0]).toMatchObject({ path: "n.ipynb", operation: "insert" });
  });
});

describe("EVT-09 TodoWrite steps", () => {
  it("falls back to a readable label for an empty todo title", () => {
    const item = toolItem(
      { name: "TodoWrite", input: { todos: [{ content: "", status: "pending" }] } },
      "item-1",
    );
    expect(item.type).toBe("plan");
    expect((item.plan as Array<{ step: string }>)[0].step).toBe("Schritt 1");
  });
});

describe("EVT-10 hooks and permission warnings", () => {
  it("attaches a hook activity item to the active turn and updates it on hook_response", () => {
    const id = threadId(`hooks-${Math.random()}`) as unknown as string;
    seedConversation(id, { id: "turn-1", items: [], status: "inProgress" });

    handleClaudeMessage(id, "/repo", { type: "system", subtype: "hook_started", hook_name: "PreToolUse" });
    let conv = claudeChatStore.getState().conversations[id];
    let hook = conv.turns[0].items.find((item) => item.type === "hookActivity");
    expect(hook).toMatchObject({ hookName: "PreToolUse", status: "inProgress" });

    handleClaudeMessage(id, "/repo", { type: "system", subtype: "hook_response", hook_name: "PreToolUse", is_error: false });
    conv = claudeChatStore.getState().conversations[id];
    const hooksAfter = conv.turns[0].items.filter((item) => item.type === "hookActivity");
    expect(hooksAfter).toHaveLength(1);
    expect(hooksAfter[0].status).toBe("completed");
  });

  it("keeps a permission_denied system message visible on the active turn", () => {
    const id = threadId(`perm-${Math.random()}`) as unknown as string;
    seedConversation(id, { id: "turn-1", items: [], status: "inProgress" });

    handleClaudeMessage(id, "/repo", { type: "system", subtype: "permission_denied", message: "Bash denied" });
    const conv = claudeChatStore.getState().conversations[id];
    expect(conv.turns[0].items).toContainEqual(expect.objectContaining({ type: "permissionWarning", message: "Bash denied" }));

    const normalized = normalizeClaudeEvent({ type: "system", subtype: "permission_denied", message: "Bash denied" }, context);
    expect(normalized).toEqual([expect.objectContaining({ type: "error", message: "Bash denied" })]);
  });
});

describe("TASK-01 subagent linkage", () => {
  it("folds a task_started event into the Task tool_use card instead of creating a duplicate", () => {
    const id = threadId(`task-${Math.random()}`) as unknown as string;
    const taskCard = toolItem({ type: "tool_use", name: "Task", id: "tu-task-1", input: { description: "Run tests" } }, "item-0");
    seedConversation(id, { id: "turn-1", items: [taskCard], status: "inProgress" });

    handleClaudeMessage(id, "/repo", {
      type: "system",
      subtype: "task_started",
      task_id: "task-99",
      parent_tool_use_id: "tu-task-1",
      description: "Run tests",
    });

    const conv = claudeChatStore.getState().conversations[id];
    expect(conv.turns[0].items).toHaveLength(1);
    expect(conv.turns[0].items[0]).toMatchObject({
      toolUseId: "tu-task-1",
      taskId: "task-99",
      parentToolUseId: "tu-task-1",
      status: "inProgress",
    });
  });
});
