import { describe, expect, it } from "vitest";

import {
  draftKey,
  draftsByLine,
  sortDrafts,
  toReviewPayload,
  type ReviewDraftComment,
} from "./pr-review-drafts";

function draft(overrides: Partial<ReviewDraftComment> & { id: string }): ReviewDraftComment {
  return {
    filePath: "src/app.ts",
    line: 12,
    body: "nit",
    createdAt: "2024-06-01T10:00:00Z",
    ...overrides,
  };
}

describe("draftKey", () => {
  it("scopes drafts per repository and pull request", () => {
    expect(draftKey("/repos/app", 7)).toBe("/repos/app#7");
    expect(draftKey("/repos/app", 8)).not.toBe(draftKey("/repos/app", 7));
  });
});

describe("sortDrafts", () => {
  it("orders by file, line and creation time", () => {
    const sorted = sortDrafts([
      draft({ id: "c", filePath: "src/z.ts", line: 1 }),
      draft({ id: "b", line: 40 }),
      draft({ id: "a", line: 12 }),
      draft({ id: "a2", line: 12, createdAt: "2024-06-01T09:00:00Z" }),
    ]);

    expect(sorted.map((d) => d.id)).toEqual(["a2", "a", "b", "c"]);
  });
});

describe("draftsByLine", () => {
  it("only indexes the drafts of the requested file", () => {
    const byLine = draftsByLine(
      [
        draft({ id: "a" }),
        draft({ id: "b" }),
        draft({ id: "c", filePath: "src/other.ts", line: 3 }),
      ],
      "src/app.ts",
    );

    expect(byLine.get(12)?.map((d) => d.id)).toEqual(["a", "b"]);
    expect(byLine.get(3)).toBeUndefined();
  });
});

describe("toReviewPayload", () => {
  it("maps drafts onto the backend comment shape", () => {
    expect(
      toReviewPayload([
        draft({ id: "b", line: 40, body: "  trailing whitespace  " }),
        draft({ id: "a", line: 12 }),
      ]),
    ).toEqual([
      { path: "src/app.ts", line: 12, body: "nit" },
      { path: "src/app.ts", line: 40, body: "trailing whitespace" },
    ]);
  });

  it("drops empty drafts so the review is not rejected", () => {
    expect(toReviewPayload([draft({ id: "a", body: "   " })])).toEqual([]);
  });
});
