import { describe, expect, it } from "vitest";
import { compactStatusFromEvent, resolveCompactRoute } from "@/lib/agents/providers/claude/chat-store";

describe("USE-03 compact route and boundary events", () => {
  it("routes to native when the capability is supported", () => {
    expect(resolveCompactRoute({ status: "supported" })).toBe("native");
  });

  it("routes to a slash turn when unsupported", () => {
    expect(resolveCompactRoute({ status: "unsupported" })).toBe("slash-turn");
  });

  it("recognizes compact_boundary as a top-level event", () => {
    expect(compactStatusFromEvent({ type: "compact_boundary" })).toBe("done");
  });

  it("recognizes compact_boundary nested under a system event", () => {
    expect(compactStatusFromEvent({ type: "system", subtype: "compact_boundary" })).toBe("done");
  });

  it("reports failure when the boundary event carries an error", () => {
    expect(compactStatusFromEvent({ type: "compact_boundary", error: "context too small" })).toBe("failed");
  });

  it("returns null for unrelated events", () => {
    expect(compactStatusFromEvent({ type: "assistant" })).toBeNull();
  });
});
