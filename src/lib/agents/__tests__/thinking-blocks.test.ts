import { describe, expect, it } from "vitest";

import { applyStreamEvents } from "@/lib/agents/providers/claude/chat-store";
import type { AgentConversation, AgentTurn } from "@/lib/agents/types";

describe("EVT-03 thinking blocks", () => {
  function seed(): AgentConversation {
    const turn: AgentTurn = { id: "turn-1", items: [], status: "inProgress" };
    return {
      threadId: "t-1",
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
    } as unknown as AgentConversation;
  }

  it("streams thinking start/partial/end as a distinct reasoning item", () => {
    let conversation = seed();
    conversation = applyStreamEvents(conversation, [
      { event: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } } },
    ]);
    let item = conversation.turns[0].items[0];
    expect(item.type).toBe("reasoning");
    expect(item.__completed).toBeUndefined();

    conversation = applyStreamEvents(conversation, [
      { event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "step one" } } },
    ]);
    item = conversation.turns[0].items[0];
    expect(item.content).toEqual(["step one"]);

    conversation = applyStreamEvents(conversation, [
      { event: { type: "content_block_stop", index: 0 } },
    ]);
    item = conversation.turns[0].items[0];
    expect(item.__completed).toBe(true);
  });

  it("never renders redacted_thinking payloads as readable text", () => {
    let conversation = seed();
    conversation = applyStreamEvents(conversation, [
      {
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "redacted_thinking", data: "opaque-signature-blob" },
        },
      },
    ]);
    const item = conversation.turns[0].items[0];
    expect(item.redacted).toBe(true);
    expect(item.content).toEqual(["Geschützter Gedankengang"]);
    expect(JSON.stringify(item)).not.toContain("opaque-signature-blob");

    conversation = applyStreamEvents(conversation, [
      { event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "leak" } } },
    ]);
    expect(conversation.turns[0].items[0].content).toEqual(["Geschützter Gedankengang"]);
  });
});
