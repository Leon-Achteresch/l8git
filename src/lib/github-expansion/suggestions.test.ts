import { describe, expect, it } from "vitest";
import { applySelectedSuggestions, type SelectedSuggestion } from "./suggestions";
const s = (patch: Partial<SelectedSuggestion> = {}): SelectedSuggestion => ({ id: "1", file: "f.txt", startLine: 2, endLine: 2, expectedLines: ["b"], replacementLines: ["new", "lines"], ...patch });
describe("review suggestion batches", () => {
  it("applies multiple replacements using their original line anchors", () => {
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
  it("applies a generated replacement beyond the JavaScript argument limit", () => {
    const rows = Array.from({ length: 150_000 }, (_, i) => String(i));
    const actual = applySelectedSuggestions("before\nx\nafter", [s({ expectedLines: ["x"], replacementLines: rows })]);
    expect(actual).toBe("before\n" + rows.join("\n") + "\nafter");
  });
  it("preserves individual line endings and validates original anchors in a mixed file", () => {
    const before = "\uFEFFa\r\nb\nc\r\nd\n";
    expect(applySelectedSuggestions(before, [
      s({ startLine: 1, endLine: 1, expectedLines: ["\uFEFFa"], replacementLines: ["A"] }),
      s({ startLine: 3, endLine: 3, expectedLines: ["c"], replacementLines: ["C", "extra"] }),
    ])).toBe("\uFEFFA\r\nb\nC\r\nextra\r\nd\n");
  });
});
