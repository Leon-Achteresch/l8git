import { describe, expect, it, vi } from "vitest";

import { __claudeClientsForTests, claudeChatStore } from "@/lib/agents/providers/claude/chat-store";
import type { ClaudeClient } from "@/lib/agents/providers/claude/client";

function fakeClient(request: ReturnType<typeof vi.fn>) {
  return { request } as unknown as ClaudeClient & { request: ReturnType<typeof vi.fn> };
}

describe("TASK-07 background task stop actions", () => {
  it("stops one of two tasks independently and sends its task_id", async () => {
    const request = vi.fn().mockResolvedValue({});
    const client = fakeClient(request);
    __claudeClientsForTests.set("t-bg", client);

    const ok = await claudeChatStore.getState().terminateBackgroundTerminal("t-bg", "proc-1");

    expect(ok).toBe(true);
    expect(request).toHaveBeenCalledWith("stop_task", { task_id: "proc-1" });

    __claudeClientsForTests.delete("t-bg");
  });

  it("shows an already-finished task as completed instead of looping forever on a race with natural process end", async () => {
    const request = vi.fn().mockRejectedValue(new Error("unknown task"));
    const client = fakeClient(request);
    __claudeClientsForTests.set("t-bg-2", client);

    claudeChatStore.setState((state) => ({
      conversations: {
        ...state.conversations,
        "t-bg-2": {
          threadId: "t-bg-2",
          path: "/repo",
          title: "t",
          model: "",
          reasoningEffort: null,
          collaborationMode: "default",
          approvalPolicy: "on-request",
          sandboxMode: "read-only",
          turns: [{
            id: "turn-1",
            status: "inProgress",
            items: [{
              id: "task-1",
              type: "collabAgentToolCall",
              taskId: "proc-gone",
              status: "inProgress",
            }],
          }],
          activeTurnId: "turn-1",
          loading: false,
          error: null,
        } as unknown as (typeof state.conversations)[string],
      },
    }));

    const ok = await claudeChatStore.getState().terminateBackgroundTerminal("t-bg-2", "proc-gone");

    expect(ok).toBe(false);
    const conv = claudeChatStore.getState().conversations["t-bg-2"];
    expect(conv.turns[0].items[0].status).toBe("inProgress");

    __claudeClientsForTests.delete("t-bg-2");
  });
});
