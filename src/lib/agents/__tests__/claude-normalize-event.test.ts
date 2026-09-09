import { describe, expect, it } from "vitest";

import { normalizeClaudeEvent } from "@/lib/agents/providers/claude/chat-store";
import { driverKind, instanceId, nativeSessionId, threadId } from "@/lib/agents/types";

const context = {
  driver: driverKind("claude"),
  instance: instanceId("claude:default"),
  threadId: threadId("t-1"),
  nativeSessionId: nativeSessionId("native-1"),
  sequence: 1,
};

describe("normalizeClaudeEvent", () => {
  it("maps system envelope task_started to a canonical task event", () => {
    const raw = {
      type: "system",
      subtype: "task_started",
      task_id: "task-1",
      description: "Running lint",
    };
    const events = normalizeClaudeEvent(raw, context);
    expect(events).toEqual([
      expect.objectContaining({ type: "task", itemId: "task-1", status: "task_started" }),
    ]);
  });

  it("maps system envelope task_progress, task_updated and task_notification the same way as task_started", () => {
    for (const subtype of ["task_progress", "task_updated", "task_notification"]) {
      const events = normalizeClaudeEvent({ type: "system", subtype, task_id: "task-2" }, context);
      expect(events).toEqual([expect.objectContaining({ type: "task", itemId: "task-2" })]);
    }
  });

  it("maps system envelope status and hook subtypes without treating them as unknown", () => {
    const statusEvents = normalizeClaudeEvent({ type: "system", subtype: "status", status: "compacting" }, context);
    expect(statusEvents).toEqual([expect.objectContaining({ type: "task", itemId: "compaction" })]);

    const hookEvents = normalizeClaudeEvent({ type: "system", subtype: "hook_started", hook_name: "PreToolUse" }, context);
    expect(hookEvents).toEqual([expect.objectContaining({ type: "task", itemId: "PreToolUse", status: "hook_started" })]);
  });

  it("ignores unrecognized system subtypes instead of guessing", () => {
    const events = normalizeClaudeEvent({ type: "system", subtype: "totally_unknown_thing" }, context);
    expect(events).toEqual([]);
  });

  it("extracts a single text event from a stream_event text_delta", () => {
    const raw = {
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
    };
    const events = normalizeClaudeEvent(raw, context);
    expect(events).toEqual([expect.objectContaining({ type: "text", text: "Hello" })]);
  });

  it("extracts exactly one text event from the final assistant snapshot, matching the streamed delta", () => {
    const deltaEvents = normalizeClaudeEvent(
      { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi there" } } },
      context,
    );
    const snapshotEvents = normalizeClaudeEvent(
      { type: "assistant", message: { id: "m1", content: [{ type: "text", text: "Hi there" }] } },
      context,
    );
    expect(deltaEvents).toHaveLength(1);
    expect(snapshotEvents).toHaveLength(1);
    expect(deltaEvents[0]).toMatchObject({ type: "text", text: "Hi there" });
    expect(snapshotEvents[0]).toMatchObject({ type: "text", text: "Hi there" });
  });

  it("emits a tool event per tool_use block in an assistant snapshot", () => {
    const raw = {
      type: "assistant",
      message: {
        id: "m2",
        content: [
          { type: "tool_use", id: "tool-a", name: "Bash" },
          { type: "text", text: "" },
          { type: "tool_use", id: "tool-b", name: "Read" },
        ],
      },
    };
    const events = normalizeClaudeEvent(raw, context);
    expect(events).toEqual([
      expect.objectContaining({ type: "tool", toolName: "Bash", itemId: "tool-a" }),
      expect.objectContaining({ type: "tool", toolName: "Read", itemId: "tool-b" }),
    ]);
  });

  it("maps a result frame to a turn event, adding a usage event only when usage is present", () => {
    const withoutUsage = normalizeClaudeEvent({ type: "result", is_error: false }, context);
    expect(withoutUsage).toEqual([expect.objectContaining({ type: "turn", status: "completed" })]);

    const withUsage = normalizeClaudeEvent(
      { type: "result", is_error: true, usage: { input_tokens: 10, output_tokens: 5 } },
      context,
    );
    expect(withUsage).toEqual([
      expect.objectContaining({ type: "turn", status: "failed" }),
      expect.objectContaining({ type: "usage", usage: expect.objectContaining({ inputTokens: 10, outputTokens: 5 }) }),
    ]);
  });

  it("never treats an unknown control-style frame as a success", () => {
    const events = normalizeClaudeEvent({ type: "some_future_control_frame" }, context);
    expect(events).toEqual([]);
  });
});
