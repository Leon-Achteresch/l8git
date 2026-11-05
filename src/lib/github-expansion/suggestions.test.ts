import { describe, expect, it } from "vitest";
import { applySelectedSuggestions, type SelectedSuggestion } from "./suggestions";
const s = (patch: Partial<SelectedSuggestion> = {}): SelectedSuggestion => ({ id: "1", file: "f.txt", startLine: 2, endLine: 2, expectedLines: ["b"], replacementLines: ["new", "lines"], ...patch });
describe("review suggestion batches", () => {
  it("applies backwards so multiple replacements retain original line anchors", () => {
    expect(applySelectedSuggestions("a\nb\nc\nd\n", [s(), s({ id: "2", startLine: 4, endLine: 4, expectedLines: ["d"], replacementLines: [] })])).toBe("a\nnew\nlines\nc\n");
  });
  it("rejects stale contexts, overlapping ranges and invalid positions", () => {
    expect(() => applySelectedSuggestions("a\nchanged\nc\n", [s()])).toThrow("no longer matches");
    expect(() => applySelectedSuggestions("a\nb\nc\n", [s(), s({ id: "2" })])).toThrow("overlap");
    expect(() => applySelectedSuggestions("a\nb\nc\n", [s({ startLine: 0 })])).toThrow("invalid");
  });
  it("preserves CRLF and no-final-newline content, and supports deleting a whole file", () => {
    expect(applySelectedSuggestions("a\r\nb\r\n", [s()])).toBe("a\r\nnew\r\nlines\r\n");
    expect(applySelectedSuggestions("a\nb", [s()])).toBe("a\nnew\nlines");
    expect(applySelectedSuggestions("b\n", [s({ startLine: 1, endLine: 1, replacementLines: [] })])).toBe("");
  });
});
