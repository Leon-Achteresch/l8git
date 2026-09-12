import { describe, expect, it } from "vitest";
import {
  clearThreadSuggestions,
  extractSuggestionsFromFrame,
  getThreadSuggestions,
  selectSuggestion,
  setThreadSuggestions,
} from "@/lib/agents/providers/claude/chat-store";

describe("CHAT-09 provider suggestions", () => {
  it("extracts suggestions from a frame and associates them with the completed turn", () => {
    const suggestions = extractSuggestionsFromFrame({ suggestions: ["Try X", "Try Y", ""] }, "turn-1");
    expect(suggestions).toHaveLength(2);
    expect(suggestions.every((entry) => entry.turnId === "turn-1")).toBe(true);
  });

  it("ignores frames without a suggestions array", () => {
    expect(extractSuggestionsFromFrame({}, "turn-1")).toEqual([]);
  });

  it("clicking a suggestion inserts into the composer via callback without auto-send", () => {
    const threadId = "thread-suggest";
    setThreadSuggestions(threadId, [{ id: "turn-1-0", text: "Try X", turnId: "turn-1" }]);
    let inserted = "";
    const handled = selectSuggestion(threadId, "turn-1-0", (text) => {
      inserted = text;
    });
    expect(handled).toBe(true);
    expect(inserted).toBe("Try X");
  });

  it("expires suggestions on new input via clearThreadSuggestions", () => {
    const threadId = "thread-expire";
    setThreadSuggestions(threadId, [{ id: "turn-1-0", text: "Try X", turnId: "turn-1" }]);
    clearThreadSuggestions(threadId);
    expect(getThreadSuggestions(threadId)).toEqual([]);
  });
});
