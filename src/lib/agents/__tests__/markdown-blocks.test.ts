import { describe, expect, it } from "vitest";

import { splitMarkdownBlocks } from "@/lib/agents/markdown-blocks";

/**
 * The split is a rendering optimization, so the bar is that rejoining the
 * blocks with a blank line reproduces a document that renders identically.
 * These cases are the ones where a naive blank-line split does not.
 */
describe("splitMarkdownBlocks", () => {
  it("splits consecutive paragraphs", () => {
    expect(splitMarkdownBlocks("first\n\nsecond\n\nthird")).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("keeps a fenced block whole, blank lines and all", () => {
    const source = "intro\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nafter";
    expect(splitMarkdownBlocks(source)).toEqual([
      "intro",
      "```ts\nconst a = 1;\n\nconst b = 2;\n```",
      "after",
    ]);
  });

  it("keeps a loose ordered list in one block so numbering does not restart", () => {
    const source = "1. one\n\n2. two\n\n3. three";
    expect(splitMarkdownBlocks(source)).toEqual([source]);
  });

  it("keeps a loose bullet list with indented continuations in one block", () => {
    const source = "- one\n\n  more about one\n\n- two";
    expect(splitMarkdownBlocks(source)).toEqual([source]);
  });

  it("ends a list when a paragraph follows it", () => {
    expect(splitMarkdownBlocks("- one\n- two\n\nafter the list")).toEqual([
      "- one\n- two",
      "after the list",
    ]);
  });

  it("keeps a multi-paragraph block quote in one block", () => {
    const source = "> first\n\n> second";
    expect(splitMarkdownBlocks(source)).toEqual([source]);
  });

  it("does not split a document carrying reference definitions", () => {
    const source = "See [the docs][d].\n\nMore text.\n\n[d]: https://example.com";
    expect(splitMarkdownBlocks(source)).toEqual([source]);
  });

  it("does not split a document carrying footnote definitions", () => {
    const source = "Text with a note.[^1]\n\nMore.\n\n[^1]: The note.";
    expect(splitMarkdownBlocks(source)).toEqual([source]);
  });

  it("tolerates a fence that never closes, as happens mid-stream", () => {
    const source = "intro\n\n```ts\nconst a = 1;";
    expect(splitMarkdownBlocks(source)).toEqual(["intro", "```ts\nconst a = 1;"]);
  });

  it("drops leading and trailing blank lines without emitting empty blocks", () => {
    expect(splitMarkdownBlocks("\n\nonly\n\n\n")).toEqual(["only"]);
  });

  it("preserves every non-blank line across the split", () => {
    const source = "# Title\n\nPara one.\n\n- a\n\n- b\n\n```sh\nls\n```\n\nEnd.";
    const rejoined = splitMarkdownBlocks(source).join("\n");
    const lines = (text: string) => text.split("\n").filter((line) => line.trim() !== "");
    expect(lines(rejoined)).toEqual(lines(source));
  });
});
