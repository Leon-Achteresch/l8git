import { describe, expect, it, vi } from "vitest";

import {
  __claudeClientsForTests,
  claudeChatStore,
  finalizeThreadExit,
} from "@/lib/agents/providers/claude/chat-store";
import type { ClaudeClient } from "@/lib/agents/providers/claude/client";

function fakeClient() {
  return {
    setPermissionMode: vi.fn().mockResolvedValue(undefined),
    setModel: vi.fn().mockResolvedValue(undefined),
    setMaxThinkingTokens: vi.fn().mockResolvedValue(undefined),
  } as unknown as ClaudeClient & {
    setPermissionMode: ReturnType<typeof vi.fn>;
    setModel: ReturnType<typeof vi.fn>;
  };
}

describe("ASK-02 session-scoped permission changes", () => {
  it("only pushes setPermissionMode to the visible thread's client, not other sessions", async () => {
    const active = fakeClient();
    const other = fakeClient();
    __claudeClientsForTests.set("t-active", active);
    __claudeClientsForTests.set("t-other", other);
    claudeChatStore.setState({ visibleThreadId: "t-active" });

    claudeChatStore.getState().setCollaborationMode("plan");
    await Promise.resolve();

    expect(active.setPermissionMode).toHaveBeenCalledWith("plan");
    expect(other.setPermissionMode).not.toHaveBeenCalled();

    __claudeClientsForTests.delete("t-active");
    __claudeClientsForTests.delete("t-other");
  });

  it("only pushes setModel to the visible thread's client", async () => {
    const active = fakeClient();
    const other = fakeClient();
    __claudeClientsForTests.set("t-active", active);
    __claudeClientsForTests.set("t-other", other);
    claudeChatStore.setState({ visibleThreadId: "t-active" });

    claudeChatStore.getState().setModel("claude-x");
    await Promise.resolve();

    expect(active.setModel).toHaveBeenCalledWith("claude-x");
    expect(other.setModel).not.toHaveBeenCalled();

    __claudeClientsForTests.delete("t-active");
    __claudeClientsForTests.delete("t-other");
  });
});

describe("ASK-08 pending requests resolve on CLI exit", () => {
  it("clears pending requests for the exited thread instead of leaving zombie cards", () => {
    claudeChatStore.setState((state) => ({
      requestsByThread: {
        ...state.requestsByThread,
        "t-exit": [
          {
            sessionId: "t-exit",
            requestId: "r-1",
            method: "claude/canUseTool",
            kind: "command",
            threadId: "t-exit",
            command: "Bash",
            raw: {},
          } as never,
        ],
      },
    }));

    finalizeThreadExit("t-exit", 1);

    expect(claudeChatStore.getState().requestsByThread["t-exit"]).toEqual([]);
  });

  it("leaves other threads' pending requests untouched", () => {
    claudeChatStore.setState((state) => ({
      requestsByThread: {
        ...state.requestsByThread,
        "t-keep": [
          {
            sessionId: "t-keep",
            requestId: "r-2",
            method: "claude/canUseTool",
            kind: "command",
            threadId: "t-keep",
            command: "Bash",
            raw: {},
          } as never,
        ],
      },
    }));

    finalizeThreadExit("t-other-thread", 0);

    expect(claudeChatStore.getState().requestsByThread["t-keep"]).toHaveLength(1);
  });
});
