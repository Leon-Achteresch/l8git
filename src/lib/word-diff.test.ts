import { describe, expect, it } from "vitest";

import { diffWords, pairChangedLines, tokenizeLine, type WordDiffSegment } from "./word-diff";

function changed(segments: WordDiffSegment[]): string[] {
  return segments.filter((s) => s.changed).map((s) => s.text);
}

function joined(segments: WordDiffSegment[]): string {
  return segments.map((s) => s.text).join("");
}

describe("tokenizeLine", () => {
  it("splits words, whitespace and punctuation", () => {
    expect(tokenizeLine("const a = 1;")).toEqual([
      "const",
      " ",
      "a",
      " ",
      "=",
      " ",
      "1",
      ";",
    ]);
  });

  it("keeps unicode letters and digits together", () => {
    expect(tokenizeLine("Grüße42 ok")).toEqual(["Grüße42", " ", "ok"]);
  });

  it("returns an empty list for an empty line", () => {
    expect(tokenizeLine("")).toEqual([]);
  });
});

describe("diffWords", () => {
  it("highlights only the replaced word", () => {
    const result = diffWords("const value = compute(a, b);", "const value = compute(a, c);");
    expect(result).not.toBeNull();
    expect(changed(result!.del)).toEqual(["b"]);
    expect(changed(result!.add)).toEqual(["c"]);
  });

  it("keeps the full line text intact across segments", () => {
    const oldLine = "  return foo(bar);";
    const newLine = "  return foo(baz, qux);";
    const result = diffWords(oldLine, newLine)!;
    expect(joined(result.del)).toBe(oldLine);
    expect(joined(result.add)).toBe(newLine);
  });

  it("marks pure insertions inside a line", () => {
    const result = diffWords("a b c", "a b extra c")!;
    expect(changed(result.del)).toEqual([]);
    expect(changed(result.add).join("")).toContain("extra");
  });

  it("returns null for identical lines", () => {
    expect(diffWords("same", "same")).toBeNull();
  });

  it("returns null when a line is empty", () => {
    expect(diffWords("", "added")).toBeNull();
  });

  it("returns null for completely unrelated lines", () => {
    expect(diffWords("alpha beta gamma", "1234 5678 9012")).toBeNull();
  });

  it("returns null for very long lines", () => {
    const long = Array.from({ length: 600 }, (_, i) => `t${i}`).join(" ");
    expect(diffWords(long, `${long} tail`)).toBeNull();
  });

  it("detects whitespace-only changes", () => {
    const result = diffWords("a = 1", "a  =  1")!;
    expect(joined(result.del)).toBe("a = 1");
    expect(joined(result.add)).toBe("a  =  1");
    expect(changed(result.add).length).toBeGreaterThan(0);
  });
});

describe("pairChangedLines", () => {
  it("pairs equally sized del/add blocks by position", () => {
    const pairs = pairChangedLines(["ctx", "del", "del", "add", "add", "ctx"]);
    expect(pairs.get(1)).toBe(3);
    expect(pairs.get(2)).toBe(4);
    expect(pairs.get(3)).toBe(1);
    expect(pairs.get(4)).toBe(2);
  });

  it("leaves unbalanced blocks unpaired", () => {
    const pairs = pairChangedLines(["del", "add", "add"]);
    expect(pairs.size).toBe(0);
  });

  it("ignores pure additions", () => {
    expect(pairChangedLines(["ctx", "add", "add"]).size).toBe(0);
  });

  it("ignores pure deletions", () => {
    expect(pairChangedLines(["del", "del", "ctx"]).size).toBe(0);
  });

  it("does not pair across a context line", () => {
    expect(pairChangedLines(["del", "ctx", "add"]).size).toBe(0);
  });

  it("handles several blocks in one diff", () => {
    const pairs = pairChangedLines([
      "hunk",
      "del",
      "add",
      "ctx",
      "del",
      "del",
      "add",
      "add",
    ]);
    expect(pairs.get(1)).toBe(2);
    expect(pairs.get(4)).toBe(6);
    expect(pairs.get(5)).toBe(7);
    expect(pairs.size).toBe(6);
  });
});
