import { describe, expect, it } from "vitest";

import { parseMentions, toPromptReference } from "@/lib/agents/composer-insert";

const REPO_ROOT = "/Users/dev/repo";

describe("parseMentions", () => {
  it("parses a file mention", () => {
    const mentions = parseMentions("please check @src/index.ts now", REPO_ROOT);
    expect(mentions).toEqual([{ kind: "file", path: `${REPO_ROOT}/src/index.ts` }]);
  });

  it("parses a directory mention", () => {
    const mentions = parseMentions("look at @src/lib/", REPO_ROOT);
    expect(mentions).toEqual([{ kind: "dir", path: `${REPO_ROOT}/src/lib` }]);
  });

  it("parses a multi-line code range mention", () => {
    const mentions = parseMentions("see @src/index.ts#L10-L42", REPO_ROOT);
    expect(mentions).toEqual([
      { kind: "range", path: `${REPO_ROOT}/src/index.ts`, start: 10, end: 42 },
    ]);
  });

  it("parses a unicode path mention", () => {
    const mentions = parseMentions("@src/ünïcödé/file.ts", REPO_ROOT);
    expect(mentions).toEqual([{ kind: "file", path: `${REPO_ROOT}/src/ünïcödé/file.ts` }]);
  });

  it("rejects traversal outside repo root", () => {
    const mentions = parseMentions("@../../etc/passwd", REPO_ROOT);
    expect(mentions).toEqual([]);
  });

  it("rejects absolute paths outside the repo", () => {
    const mentions = parseMentions("@/etc/passwd", REPO_ROOT);
    expect(mentions).toEqual([]);
  });

  it("accepts absolute paths inside the repo", () => {
    const mentions = parseMentions(`@${REPO_ROOT}/src/index.ts`, REPO_ROOT);
    expect(mentions).toEqual([{ kind: "file", path: `${REPO_ROOT}/src/index.ts` }]);
  });
});

describe("toPromptReference", () => {
  it("formats a file reference", () => {
    expect(toPromptReference({ kind: "file", path: "/repo/a.ts" })).toBe("@/repo/a.ts");
  });

  it("formats a single-line range reference", () => {
    expect(toPromptReference({ kind: "range", path: "/repo/a.ts", start: 5, end: 5 })).toBe(
      "@/repo/a.ts#L5",
    );
  });

  it("formats a multi-line range reference", () => {
    expect(toPromptReference({ kind: "range", path: "/repo/a.ts", start: 5, end: 20 })).toBe(
      "@/repo/a.ts#L5-L20",
    );
  });
});
