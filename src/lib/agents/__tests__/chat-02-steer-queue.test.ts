import { describe, expect, it } from "vitest";
import {
  dequeueNextMessage,
  editQueuedMessage,
  listQueuedMessages,
  planSendMode,
  queueMessage,
  removeQueuedMessage,
} from "@/lib/agents/providers/claude/chat-store";

describe("CHAT-02 steer vs queue", () => {
  it("steers when no turn is active", () => {
    expect(planSendMode({ turnActive: false, steerSupported: false })).toBe("steer");
  });

  it("steers into the running turn when supported", () => {
    expect(planSendMode({ turnActive: true, steerSupported: true })).toBe("steer");
  });

  it("queues when a turn is active and steer is unsupported", () => {
    expect(planSendMode({ turnActive: true, steerSupported: false })).toBe("queue");
  });

  it("keeps queued order, allows edit and removal by id, and delivers in FIFO order", () => {
    const threadId = "thread-1";
    const first = queueMessage(threadId, "m1", "first");
    const second = queueMessage(threadId, "m2", "second");
    const third = queueMessage(threadId, "m3", "third");

    expect(listQueuedMessages(threadId).map((entry) => entry.id)).toEqual([first.id, second.id, third.id]);

    expect(editQueuedMessage(threadId, "m2", "second-edited")).toBe(true);
    expect(listQueuedMessages(threadId).find((entry) => entry.id === "m2")?.text).toBe("second-edited");

    expect(removeQueuedMessage(threadId, "m3")).toBe(true);
    expect(listQueuedMessages(threadId).map((entry) => entry.id)).toEqual(["m1", "m2"]);

    const delivered = dequeueNextMessage(threadId);
    expect(delivered?.id).toBe("m1");
    expect(delivered?.status).toBe("delivered");
    expect(listQueuedMessages(threadId).map((entry) => entry.id)).toEqual(["m2"]);
  });
});
