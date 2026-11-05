import { describe, expect, it } from "vitest";

import type { ReviewThread } from "@/lib/github-expansion/api";
import { applySelectedSuggestions } from "@/lib/github-expansion/suggestions";
import { toReviewPayload, type ReviewDraftComment } from "@/lib/pr-review-drafts";
import { applySuggestionToContent } from "@/lib/pr-suggestions";
import { parseUnifiedDiff } from "@/lib/unified-diff";

import { anchorAt, buildRange, headLinesFromPatch, rangeFields, rangeKeys, storedRangeKeys } from "./diff-ranges";
import { collectCandidates, findOverlaps, hasPartialComments, planUnifiedDiff, staleSuggestions, toSelected } from "./suggestion-batch";

// old: a b c d e      new: a B c x d e   (two hunks below in PATCH2)
const PATCH = "@@ -1,5 +1,6 @@\n a\n-b\n+B\n c\n+x\n d\n e";
const lines = parseUnifiedDiff(PATCH);
const at = (i: number) => anchorAt(lines, i)!;

describe("diff ranges (ID 17)", () => {
  it("anchors deleted lines on LEFT/old and others on RIGHT/new; headers have no anchor", () => {
    expect(anchorAt(lines, 0)).toBeNull();
    expect(at(2)).toMatchObject({ side: "LEFT", line: 2, text: "b" });
    expect(at(3)).toMatchObject({ side: "RIGHT", line: 2, text: "B" });
    expect(at(5)).toMatchObject({ side: "RIGHT", line: 4, text: "x" });
  });
  it("RIGHT range and reversed selection produce identical start/end fields", () => {
    const forward = rangeFields(buildRange(at(3), at(5))!);
    expect(forward).toEqual({ line: 4, side: "RIGHT", startLine: 2, startSide: "RIGHT" });
    expect(rangeFields(buildRange(at(5), at(3))!)).toEqual(forward);
  });
  it("LEFT start to RIGHT end is a mixed-side range; single click is single line", () => {
    expect(rangeFields(buildRange(at(2), at(5))!)).toEqual({ line: 4, side: "RIGHT", startLine: 2, startSide: "LEFT" });
    expect(rangeFields(buildRange(at(2), at(2))!)).toEqual({ line: 2, side: "LEFT" });
  });
  it("rejects ranges across hunks and mixed ranges GitHub cannot represent", () => {
    const two = parseUnifiedDiff("@@ -1,1 +1,1 @@\n-a\n+A\n@@ -9,1 +9,1 @@\n z");
    expect(buildRange(anchorAt(two, 2)!, anchorAt(two, 4)!)).toBeNull();
    // old 2 (b) to new 2 (B): start_line must be below line
    expect(buildRange(at(2), at(3))).toBeNull();
  });
  it("highlights every real anchor inside the range, both sides", () => {
    expect([...rangeKeys(lines, buildRange(at(2), at(5))!)]).toEqual(["LEFT:2", "RIGHT:2", "RIGHT:3", "RIGHT:4"]);
    expect(storedRangeKeys({ line: 4, side: "RIGHT", startLine: 2, startSide: "RIGHT" })).toEqual(["RIGHT:2", "RIGHT:3", "RIGHT:4"]);
    expect(storedRangeKeys({ line: 7 })).toEqual(["RIGHT:7"]);
  });
  it("draft payload carries snake-case range fields for submission", () => {
    const draft: ReviewDraftComment = { id: "d", filePath: "f", body: "x", createdAt: "", ...rangeFields(buildRange(at(5), at(2))!) };
    expect(toReviewPayload([draft])).toEqual([{ path: "f", line: 4, body: "x", side: "RIGHT", start_line: 2, start_side: "LEFT" }]);
  });
  it("head text is only read from real new-side diff lines", () => {
    expect(headLinesFromPatch(lines, 2, 4)).toEqual(["B", "c", "x"]);
    expect(headLinesFromPatch(lines, 6, 9)).toBeNull();
  });
  it("local single apply replaces the whole same-side range", () => {
    expect(applySuggestionToContent("a\nb\nc\nd\n", 3, ["X"], 2)).toBe("a\nX\nd\n");
    expect(applySuggestionToContent("a\nb\n", 1, ["X"], 2)).toBeNull();
  });
});

const thread = (patch: Partial<ReviewThread> & { body?: string } = {}): ReviewThread => ({
  id: patch.id ?? "T1", isResolved: false, isOutdated: false, path: patch.path ?? "f.txt", line: 2, startLine: null, diffSide: "RIGHT",
  comments: { nodes: [{ id: `${patch.id ?? "T1"}c`, body: patch.body ?? "fix\n```suggestion\nBB\n```", url: "u", createdAt: "", author: { login: "rev" } }], pageInfo: { hasNextPage: false, endCursor: null } },
  ...patch,
});

describe("batch suggestions (ID 18)", () => {
  const patches = (file: string) => (file === "missing.txt" ? null : lines);
  it("collects anchored suggestions and rejects outdated, old-side, unpatched and off-diff ones", () => {
    const got = collectCandidates([
      thread(),
      thread({ id: "T2", isOutdated: true }),
      thread({ id: "T3", diffSide: "LEFT" }),
      thread({ id: "T4", path: "missing.txt" }),
      thread({ id: "T5", line: 9 }),
      thread({ id: "T6", line: 4, startLine: 2, startDiffSide: "RIGHT", body: "```suggestion\none\n```\n```suggestion\ntwo\n```" }),
    ], patches);
    expect(got.map((c) => [c.threadId, c.rejection])).toEqual([["T1", null], ["T2", "outdated"], ["T3", "oldSide"], ["T4", "noPatch"], ["T5", "notInDiff"], ["T6", null], ["T6", null]]);
    expect(got[0]).toMatchObject({ expectedLines: ["B"], replacementLines: ["BB"] });
    expect(got[5]).toMatchObject({ startLine: 2, endLine: 4, expectedLines: ["B", "c", "x"] });
    // two blocks in one comment target the same range: flagged as overlap, never silently merged
    expect([...findOverlaps([toSelected(got[5]), toSelected(got[6])])].sort()).toEqual(["T6c#0", "T6c#1"]);
  });
  it("rejects ranges starting on the old side or with an unknown start side", () => {
    const got = collectCandidates([
      thread({ id: "L", line: 4, startLine: 2, startDiffSide: "LEFT" }),
      thread({ id: "U", line: 4, startLine: 2 }),
      thread({ id: "R", line: 4, startLine: 2, startDiffSide: "RIGHT" }),
      thread({ id: "S", line: 2, startLine: null, startDiffSide: null }),
    ], patches);
    expect(got.map((c) => [c.threadId, c.rejection])).toEqual([["L", "oldSide"], ["U", "oldSide"], ["R", null], ["S", null]]);
  });
  it("reports partially loaded thread comments", () => {
    expect(hasPartialComments([thread()])).toBe(false);
    const partial = thread({ id: "P" });
    partial.comments.pageInfo.hasNextPage = true;
    expect(hasPartialComments([thread(), partial])).toBe(true);
  });
  it("flags overlaps per file only and stale suggestions individually", () => {
    const a = toSelected(collectCandidates([thread()], patches)[0]);
    const other = { ...a, id: "o", file: "g.txt" };
    expect(findOverlaps([a, other]).size).toBe(0);
    const later = { ...a, id: "z", startLine: 4, endLine: 4, expectedLines: ["x"], replacementLines: ["y"] };
    const stale = staleSuggestions("a\nB\nc\nCHANGED\nd\n", [a, later]);
    expect([...stale.keys()]).toEqual(["z"]);
    expect(stale.get("z")).toContain("no longer matches");
  });
  it("renders the exact planned replacements for both files", () => {
    const before = "a\nB\nc\nx\nd\n";
    const s1 = { id: "1", file: "f", startLine: 2, endLine: 2, expectedLines: ["B"], replacementLines: ["B1", "B2"] };
    const s2 = { id: "2", file: "f", startLine: 4, endLine: 4, expectedLines: ["x"], replacementLines: [] };
    const diff = planUnifiedDiff(before, [s2, s1]);
    expect(diff).toBe("@@ -2,1 +2,2 @@\n-B\n+B1\n+B2\n@@ -4,1 +4,0 @@\n-x");
    expect(applySelectedSuggestions(before, [s1, s2])).toBe("a\nB1\nB2\nc\nd\n");
    expect(planUnifiedDiff("q\n", [{ ...s1, file: "g", startLine: 1, endLine: 1, expectedLines: ["q"], replacementLines: ["Q"] }])).toBe("@@ -1,1 +1,1 @@\n-q\n+Q");
  });
});

describe("pinned range submission (ID 17)", async () => {
  const { planReviewSubmission } = await import("./review-submit");
  const H1 = "1".repeat(40), H2 = "2".repeat(40);
  const d = (patch: Partial<ReviewDraftComment>): ReviewDraftComment => ({ id: "d", filePath: "f", line: 4, body: "x", createdAt: "", side: "RIGHT", ...patch });
  it("submits GitHub drafts against the head they were anchored at, with full range fields", () => {
    expect(planReviewSubmission([d({ commitId: H1, startLine: 2, startSide: "LEFT" })], "github", H1)).toEqual({
      kind: "pinned", commitId: H1, headMoved: false, comments: [{ path: "f", body: "x", line: 4, side: "RIGHT", start_line: 2, start_side: "LEFT" }],
    });
  });
  it("a later push keeps the original commit and is surfaced, never re-targeted", () => {
    const plan = planReviewSubmission([d({ commitId: H1 })], "github", H2);
    expect(plan).toMatchObject({ kind: "pinned", commitId: H1, headMoved: true });
  });
  it("refuses drafts from different heads or pinned mixed with unpinned", () => {
    expect(planReviewSubmission([d({ commitId: H1 }), d({ id: "e", commitId: H2 })], "github", H2).kind).toBe("mixed");
    expect(planReviewSubmission([d({ commitId: H1 }), d({ id: "e" })], "github", H1).kind).toBe("mixed");
  });
  it("other providers and legacy unpinned drafts keep the existing flow", () => {
    expect(planReviewSubmission([d({ commitId: H1 })], "gitlab", H1).kind).toBe("legacy");
    expect(planReviewSubmission([d({})], "github", H1).kind).toBe("legacy");
  });
  it("draft store keeps the anchoring commit", async () => {
    const { useReviewDraftStore } = await import("@/lib/pr-review-drafts");
    useReviewDraftStore.getState().addDraft("k", { filePath: "f", line: 3, body: "b", side: "RIGHT", startLine: 1, commitId: H1 });
    expect(useReviewDraftStore.getState().drafts.k[0]).toMatchObject({ commitId: H1, startLine: 1, startSide: "RIGHT" });
  });
});
