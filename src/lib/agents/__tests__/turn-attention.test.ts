import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTestPlatform } from "@/lib/agents/__tests__/platform-harness";
import { chatStoreFor } from "@/lib/agents/active-chat-store";
import type { AgentChatState } from "@/lib/agents/chat-store";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import {
  activeTurnIds,
  armTurnAttention,
  finishedThreads,
  setTurnAttentionSink,
  type TurnAttentionSink,
} from "@/lib/agents/turn-attention";

describe("activeTurnIds", () => {
  it("maps conversations to their active turn", () => {
    expect(
      activeTurnIds({
        a: { activeTurnId: "turn-1" },
        b: { activeTurnId: null },
      }),
    ).toEqual({ a: "turn-1", b: null });
  });
});

describe("finishedThreads", () => {
  it("reports threads whose turn just completed", () => {
    expect(
      finishedThreads({ a: "turn-1", b: "turn-2", c: null }, { a: null, b: "turn-2", c: null }),
    ).toEqual(["a"]);
  });

  it("ignores newly started turns and removed threads", () => {
    expect(finishedThreads({ a: null }, { a: "turn-1" })).toEqual([]);
    expect(finishedThreads({ a: "turn-1" }, {})).toEqual(["a"]);
    expect(finishedThreads({}, { a: "turn-1" })).toEqual([]);
  });

  it("treats a replaced turn id as still running", () => {
    expect(finishedThreads({ a: "turn-1" }, { a: "turn-2" })).toEqual([]);
  });
});

describe("turn attention sink", () => {
  const codexStore = chatStoreFor("codex");
  let sink: { [K in keyof TurnAttentionSink]: ReturnType<typeof vi.fn> };
  let disarm: () => void;

  function conversations(activeTurnId: string | null): AgentChatState["conversations"] {
    return {
      "t1": { activeTurnId, title: "Fix login" },
    } as unknown as AgentChatState["conversations"];
  }

  function finishATurn(): void {
    codexStore.setState({ conversations: conversations("turn-1") });
    codexStore.setState({ conversations: conversations(null) });
  }

  beforeEach(() => {
    installTestPlatform();
    useAgentProviderStore.setState({ provider: "codex" });
    codexStore.setState({ conversations: {}, threadsByPath: {}, visibleThreadId: null });
    sink = {
      isFocused: vi.fn(() => true),
      requestAttention: vi.fn(),
      notify: vi.fn(),
    };
    setTurnAttentionSink(sink as unknown as TurnAttentionSink);
    disarm = armTurnAttention();
  });

  afterEach(() => {
    disarm();
    codexStore.setState({ conversations: {}, threadsByPath: {}, visibleThreadId: null });
  });

  it("nudges the host instead of notifying while unfocused", () => {
    sink.isFocused.mockReturnValue(false);
    finishATurn();
    expect(sink.requestAttention).toHaveBeenCalledTimes(1);
    expect(sink.notify).not.toHaveBeenCalled();
  });

  it("notifies with the thread title while focused", () => {
    finishATurn();
    expect(sink.requestAttention).not.toHaveBeenCalled();
    expect(sink.notify).toHaveBeenCalledTimes(1);
    expect(sink.notify.mock.calls[0][0]).toMatchObject({ title: "Fix login" });
  });

  it("stays quiet for the thread the user is already looking at", () => {
    codexStore.setState({ visibleThreadId: "t1" });
    finishATurn();
    expect(sink.notify).not.toHaveBeenCalled();
    expect(sink.requestAttention).not.toHaveBeenCalled();
  });

  it("stops notifying once disarmed", () => {
    disarm();
    finishATurn();
    expect(sink.notify).not.toHaveBeenCalled();
  });
});
