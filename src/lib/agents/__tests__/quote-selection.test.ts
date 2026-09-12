import { describe, expect, it } from "vitest";

import { quoteSelection, resolveQuoteSource } from "@/lib/agents/transcript-text";

describe("quoteSelection", () => {
  it("builds a quote block with source reference", () => {
    const quote = quoteSelection({
      threadId: "thread-1",
      itemId: "item-1",
      text: "line one\nline two",
      range: { start: 4, end: 20 },
    });
    expect(quote.markdown).toBe("> line one\n> line two");
    expect(quote.source).toEqual({
      threadId: "thread-1",
      itemId: "item-1",
      range: { start: 4, end: 20 },
    });
  });

  it("rejects an empty selection", () => {
    expect(() =>
      quoteSelection({ threadId: "t", itemId: "i", text: "   ", range: { start: 0, end: 0 } }),
    ).toThrow();
  });
});

describe("resolveQuoteSource", () => {
  it("resolves when the source item still exists", () => {
    const transcript = new Map([["item-1", "original text"]]);
    const result = resolveQuoteSource(
      { threadId: "thread-1", itemId: "item-1", range: { start: 0, end: 4 } },
      transcript,
    );
    expect(result).toEqual({
      status: "resolved",
      threadId: "thread-1",
      itemId: "item-1",
      text: "original text",
    });
  });

  it("reports missing when the source item was deleted", () => {
    const transcript = new Map<string, string>();
    const result = resolveQuoteSource(
      { threadId: "thread-1", itemId: "gone", range: { start: 0, end: 4 } },
      transcript,
    );
    expect(result).toEqual({ status: "missing", threadId: "thread-1", itemId: "gone" });
  });
});
