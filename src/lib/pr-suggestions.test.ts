import { describe, expect, it } from "vitest";

import {
  applySuggestionToContent,
  buildSuggestionBody,
  hasSuggestion,
  splitCommentBody,
} from "./pr-suggestions";

describe("splitCommentBody", () => {
  it("separates prose from a suggestion block", () => {
    const segments = splitCommentBody(
      "Bitte den Namen fixen:\n```suggestion\nconst total = sum(items);\n```\nDanke!",
    );

    expect(segments).toEqual([
      { kind: "text", text: "Bitte den Namen fixen:" },
      { kind: "suggestion", lines: ["const total = sum(items);"] },
      { kind: "text", text: "Danke!" },
    ]);
  });

  it("keeps multi-line suggestions intact, including blank lines", () => {
    const segments = splitCommentBody("```suggestion\nif (a) {\n\n  return b;\n}\n```");

    expect(segments).toEqual([
      { kind: "suggestion", lines: ["if (a) {", "", "  return b;", "}"] },
    ]);
  });

  it("represents an empty suggestion as a deletion of the line", () => {
    expect(splitCommentBody("```suggestion\n```")).toEqual([
      { kind: "suggestion", lines: [] },
    ]);
  });

  it("survives an unclosed fence and CRLF bodies", () => {
    expect(splitCommentBody("nit\r\n```suggestion\r\nconst a = 1;")).toEqual([
      { kind: "text", text: "nit" },
      { kind: "suggestion", lines: ["const a = 1;"] },
    ]);
  });

  it("leaves ordinary code fences alone", () => {
    const segments = splitCommentBody("siehe\n```ts\nconst a = 1;\n```");
    expect(segments).toEqual([
      { kind: "text", text: "siehe\n```ts\nconst a = 1;\n```" },
    ]);
    expect(hasSuggestion("```ts\nconst a = 1;\n```")).toBe(false);
    expect(hasSuggestion("```suggestion\nconst a = 2;\n```")).toBe(true);
  });
});

describe("buildSuggestionBody", () => {
  it("prefills the current line in GitHub's suggestion format", () => {
    expect(buildSuggestionBody("  const a = 1;")).toBe(
      "```suggestion\n  const a = 1;\n```",
    );
  });

  it("keeps a leading comment above the block", () => {
    expect(buildSuggestionBody("const a = 1;", "  besser so:  ")).toBe(
      "besser so:\n\n```suggestion\nconst a = 1;\n```",
    );
  });
});

describe("applySuggestionToContent", () => {
  const file = "one\ntwo\nthree\n";

  it("replaces the anchored line", () => {
    expect(applySuggestionToContent(file, 2, ["zwei"])).toBe("one\nzwei\nthree\n");
  });

  it("expands one line into several", () => {
    expect(applySuggestionToContent(file, 1, ["a", "b"])).toBe(
      "a\nb\ntwo\nthree\n",
    );
  });

  it("deletes the line for an empty suggestion", () => {
    expect(applySuggestionToContent(file, 2, [])).toBe("one\nthree\n");
  });

  it("keeps files without a trailing newline as they are", () => {
    expect(applySuggestionToContent("one\ntwo", 2, ["zwei"])).toBe("one\nzwei");
  });

  it("preserves CRLF line endings", () => {
    expect(applySuggestionToContent("one\r\ntwo\r\n", 1, ["eins"])).toBe(
      "eins\r\ntwo\r\n",
    );
  });

  it("refuses lines outside the file", () => {
    expect(applySuggestionToContent(file, 9, ["x"])).toBeNull();
    expect(applySuggestionToContent(file, 0, ["x"])).toBeNull();
    expect(applySuggestionToContent(file, 1.5, ["x"])).toBeNull();
  });
});
