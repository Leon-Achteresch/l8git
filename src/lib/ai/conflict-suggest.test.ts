import { describe, expect, it } from "vitest";

import { parseConflictBlocks, type ConflictBlock } from "@/lib/conflict-parser";
import {
  applyConflictSuggestion,
  buildConflictSuggestionPrompt,
  classifySuggestion,
  conflictBlockContext,
  conflictBlockKey,
  containsConflictMarkers,
  diffSuggestionLines,
  extractBaseLines,
  parseConflictSuggestion,
  resolveBaseSnippet,
  stripMarkdownFences,
} from "@/lib/ai/conflict-suggest";
import { defaultPromptTemplate } from "@/lib/ai/prompts";

const CONFLICTED = [
  "const a = 1;",
  "",
  "<<<<<<< HEAD",
  "  const value = ours();",
  "=======",
  "  const value = theirs();",
  ">>>>>>> feature/x",
  "",
  "export default a;",
].join("\n");

const DIFF3_CONFLICTED = [
  "line before",
  "<<<<<<< HEAD",
  "ours line",
  "||||||| merged common ancestors",
  "base line",
  "=======",
  "theirs line",
  ">>>>>>> other",
  "line after",
].join("\n");

function firstBlock(text: string): ConflictBlock {
  const block = parseConflictBlocks(text)[0];
  expect(block).toBeDefined();
  return block;
}

describe("stripMarkdownFences", () => {
  it("keeps plain content untouched", () => {
    expect(stripMarkdownFences("const a = 1;\nconst b = 2;")).toBe(
      "const a = 1;\nconst b = 2;",
    );
  });

  it("unwraps a fenced block with a language tag", () => {
    expect(stripMarkdownFences("```ts\nconst a = 1;\n```")).toBe("const a = 1;");
  });

  it("unwraps a fenced block behind a short preamble", () => {
    expect(
      stripMarkdownFences("Here is the merged code:\n\n```\nfoo();\n```\n"),
    ).toBe("foo();");
  });

  it("keeps the indentation of the first line", () => {
    expect(stripMarkdownFences("```js\n    indented();\n```")).toBe("    indented();");
  });

  it("unwraps at the last fence so inner fences survive", () => {
    expect(stripMarkdownFences("```md\n# Title\n\n```js\ncode();\n```\n```")).toBe(
      "# Title\n\n```js\ncode();\n```",
    );
  });

  it("does not unwrap when the fence appears after a long preamble", () => {
    const text = "one\ntwo\nthree\n```\nfour\n```";
    expect(stripMarkdownFences(text)).toBe(text);
  });

  it("survives an unterminated fence", () => {
    expect(stripMarkdownFences("```ts\nconst a = 1;")).toBe("const a = 1;");
  });

  it("normalizes CRLF and trims blank edges", () => {
    expect(stripMarkdownFences("\r\n\r\na();\r\nb();\r\n\r\n")).toBe("a();\nb();");
  });
});

describe("containsConflictMarkers", () => {
  it("detects every marker kind at line start", () => {
    expect(containsConflictMarkers("a\n<<<<<<< HEAD\nb")).toBe(true);
    expect(containsConflictMarkers("a\n=======\nb")).toBe(true);
    expect(containsConflictMarkers("a\n>>>>>>> theirs\nb")).toBe(true);
    expect(containsConflictMarkers("a\n||||||| base\nb")).toBe(true);
  });

  it("ignores marker-like text inside a line", () => {
    expect(containsConflictMarkers("const arrow = a <<<<<<< b;")).toBe(false);
    expect(containsConflictMarkers("const line = '======';")).toBe(false);
  });
});

describe("parseConflictSuggestion", () => {
  it("accepts clean code and returns its lines", () => {
    const result = parseConflictSuggestion("```ts\n  const value = merged();\n```");
    expect(result).toEqual({
      ok: true,
      content: "  const value = merged();",
      lines: ["  const value = merged();"],
    });
  });

  it("rejects answers that still contain conflict markers", () => {
    const result = parseConflictSuggestion("<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> x");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("conflictMarkers");
      expect(result.messageKey).toBe("mergeAi.errorConflictMarkers");
    }
  });

  it("rejects markers that survive inside a fence", () => {
    const result = parseConflictSuggestion("```\nfoo\n<<<<<<< HEAD\n```");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("conflictMarkers");
  });

  it("rejects an empty answer", () => {
    const result = parseConflictSuggestion("```\n\n```");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("empty");
      expect(result.messageKey).toBe("mergeAi.errorEmpty");
    }
  });
});

describe("applyConflictSuggestion", () => {
  it("replaces only the block and keeps the rest of the file", () => {
    const block = firstBlock(CONFLICTED);
    const next = applyConflictSuggestion(CONFLICTED, block, "  const value = merged();");
    expect(next).toBe(
      ["const a = 1;", "", "  const value = merged();", "", "export default a;"].join("\n"),
    );
    expect(parseConflictBlocks(next)).toHaveLength(0);
  });

  it("drops the block entirely for an empty replacement", () => {
    const block = firstBlock(CONFLICTED);
    expect(applyConflictSuggestion(CONFLICTED, block, "")).toBe(
      ["const a = 1;", "", "", "export default a;"].join("\n"),
    );
  });

  it("keeps later blocks intact when the first one is replaced", () => {
    const text = [
      "<<<<<<< HEAD",
      "a1",
      "=======",
      "a2",
      ">>>>>>> x",
      "mid",
      "<<<<<<< HEAD",
      "b1",
      "=======",
      "b2",
      ">>>>>>> x",
    ].join("\n");
    const next = applyConflictSuggestion(text, parseConflictBlocks(text)[0], "a3");
    expect(next.split("\n").slice(0, 2)).toEqual(["a3", "mid"]);
    expect(parseConflictBlocks(next)).toHaveLength(1);
  });

  it("normalizes CRLF inside the replacement", () => {
    const block = firstBlock(CONFLICTED);
    const next = applyConflictSuggestion(CONFLICTED, block, "x();\r\ny();");
    expect(next).toContain("x();\ny();");
    expect(next).not.toContain("\r");
  });
});

describe("conflictBlockKey", () => {
  it("is stable for the same content at a different position", () => {
    const shifted = `// header\n${CONFLICTED}`;
    expect(conflictBlockKey(firstBlock(shifted))).toBe(conflictBlockKey(firstBlock(CONFLICTED)));
  });

  it("differs when the sides differ", () => {
    const other = CONFLICTED.replace("ours()", "somethingElse()");
    expect(conflictBlockKey(firstBlock(other))).not.toBe(
      conflictBlockKey(firstBlock(CONFLICTED)),
    );
  });

  it("does not collide when content moves between the sides", () => {
    const a = ["<<<<<<< HEAD", "x", "y", "=======", ">>>>>>> t"].join("\n");
    const b = ["<<<<<<< HEAD", "x", "=======", "y", ">>>>>>> t"].join("\n");
    expect(conflictBlockKey(firstBlock(a))).not.toBe(conflictBlockKey(firstBlock(b)));
  });
});

describe("conflictBlockContext", () => {
  it("returns the surrounding lines without the block itself", () => {
    const context = conflictBlockContext(CONFLICTED, firstBlock(CONFLICTED), 2);
    expect(context.before).toEqual(["const a = 1;", ""]);
    expect(context.after).toEqual(["", "export default a;"]);
  });

  it("clamps at the file edges", () => {
    const context = conflictBlockContext(CONFLICTED, firstBlock(CONFLICTED), 999);
    expect(context.before).toHaveLength(2);
    expect(context.after).toHaveLength(2);
  });
});

describe("base extraction", () => {
  it("finds the diff3 base region", () => {
    const block = firstBlock(DIFF3_CONFLICTED);
    expect(extractBaseLines(DIFF3_CONFLICTED, block)).toEqual(["base line"]);
    expect(resolveBaseSnippet(DIFF3_CONFLICTED, block, "whole base file")).toEqual({
      kind: "region",
      text: "base line",
    });
  });

  it("falls back to the base file and then to nothing", () => {
    const block = firstBlock(CONFLICTED);
    expect(extractBaseLines(CONFLICTED, block)).toBeNull();
    expect(resolveBaseSnippet(CONFLICTED, block, "base file body")).toEqual({
      kind: "file",
      text: "base file body",
    });
    expect(resolveBaseSnippet(CONFLICTED, block).kind).toBe("none");
  });
});

describe("classifySuggestion", () => {
  const block = firstBlock(CONFLICTED);

  it("recognizes the plain sides", () => {
    expect(classifySuggestion(block.oursLines, block)).toBe("ours");
    expect(classifySuggestion(block.theirsLines, block)).toBe("theirs");
    expect(classifySuggestion([...block.oursLines, ...block.theirsLines], block)).toBe("both");
  });

  it("ignores trailing whitespace and blank edges", () => {
    expect(classifySuggestion(["", "  const value = ours();   ", ""], block)).toBe("ours");
  });

  it("reports anything else as custom", () => {
    expect(classifySuggestion(["  const value = merged();"], block)).toBe("custom");
  });
});

describe("diffSuggestionLines", () => {
  it("marks kept, removed and added lines", () => {
    expect(diffSuggestionLines(["a", "b", "c"], ["a", "x", "c"])).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "x" },
      { kind: "same", text: "c" },
    ]);
  });

  it("handles empty sides", () => {
    expect(diffSuggestionLines([], [])).toEqual([]);
    expect(diffSuggestionLines([], ["a"])).toEqual([{ kind: "added", text: "a" }]);
    expect(diffSuggestionLines(["a"], [])).toEqual([{ kind: "removed", text: "a" }]);
  });

  it("keeps every target line in order", () => {
    const to = ["one", "two", "three", "four"];
    const diff = diffSuggestionLines(["one", "zwei", "three"], to);
    expect(diff.filter((l) => l.kind !== "removed").map((l) => l.text)).toEqual(to);
  });
});

describe("buildConflictSuggestionPrompt", () => {
  const template = defaultPromptTemplate("conflictResolution");

  it("fills the template placeholders and never leaks markers into the system prompt", () => {
    const block = firstBlock(CONFLICTED);
    const { system, prompt } = buildConflictSuggestionPrompt(template, {
      file: "src/app.ts",
      language: "Deutsch",
      text: CONFLICTED,
      block,
      contextLines: 2,
    });

    expect(system).toContain("src/app.ts");
    expect(system).toContain("Deutsch");
    expect(system).toContain("const value = ours();");
    expect(system).toContain("const value = theirs();");
    expect(system).not.toContain("{{");
    expect(system).not.toContain("<<<<<<< HEAD");

    expect(prompt).toContain("src/app.ts");
    expect(prompt).toContain("export default a;");
    expect(prompt).toContain("No common ancestor is available");
    expect(prompt).not.toContain("<<<<<<< HEAD");
  });

  it("labels a diff3 base region as such", () => {
    const { system, prompt } = buildConflictSuggestionPrompt(template, {
      file: "a.txt",
      language: "English",
      text: DIFF3_CONFLICTED,
      block: firstBlock(DIFF3_CONFLICTED),
    });
    expect(system).toContain("base line");
    expect(prompt).toContain("common ancestor of exactly this conflicting region");
  });

  it("marks a whole-file base version", () => {
    const { prompt } = buildConflictSuggestionPrompt(template, {
      file: "a.txt",
      language: "English",
      text: CONFLICTED,
      block: firstBlock(CONFLICTED),
      baseFile: "base body",
    });
    expect(prompt).toContain("common ancestor of the whole file");
  });

  it("clips huge sides", () => {
    const huge = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
    const text = ["<<<<<<< HEAD", huge, "=======", "theirs", ">>>>>>> x"].join("\n");
    const { system } = buildConflictSuggestionPrompt(template, {
      file: "big.txt",
      language: "English",
      text,
      block: firstBlock(text),
    });
    expect(system.length).toBeLessThan(30_000);
  });
});
