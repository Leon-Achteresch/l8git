import { describe, expect, it, vi } from "vitest";

import type { AgentReviewInvoke } from "@/lib/agents/agent-review";
import { chapterState, type ChangeInitiative, type ReviewChapter } from "@/lib/change-workflow/model";
import { anchorFingerprint, observeAnchors, patchSideLines } from "./anchors";
import { mergeStep, prNumberFromUrl, resolveRunningStep } from "./initiative-ops";
import { indexMap, layoutTiles } from "./map-layout";

const PATCH = "@@ -1,3 +1,4 @@\n a\n-b\n+B\n+C\n d";
const PATCH2 = "@@ -1,3 +1,4 @@\n a\n-b\n+X\n+C\n d";

describe("anchors from real patch lines", () => {
  it("maps each side to the lines the patch shows", () => {
    expect([...patchSideLines(PATCH, "head")]).toEqual([[1, "a"], [2, "B"], [3, "C"], [4, "d"]]);
    expect([...patchSideLines(PATCH, "base")]).toEqual([[1, "a"], [2, "b"], [3, "d"]]);
  });

  it("refuses ranges outside the patch and detects changed content", async () => {
    expect(await anchorFingerprint(PATCH, "head", 4, 9)).toBeNull();
    const fp = (await anchorFingerprint(PATCH, "head", 2, 3))!;
    const chapter: ReviewChapter = { id: "c", title: "t", explanation: "", anchors: [{ path: "f", side: "head", startLine: 2, endLine: 3, baseSha: "b", headSha: "h", contentFingerprint: fp }] };
    expect(chapterState(chapter, await observeAnchors(chapter.anchors, new Map([["f", PATCH]])))).toBe("current");
    expect(chapterState(chapter, await observeAnchors(chapter.anchors, new Map([["f", PATCH2]])))).toBe("changed");
    expect(chapterState(chapter, await observeAnchors(chapter.anchors, new Map([["f", undefined]])))).toBe("unknown");
    expect(chapterState(chapter, await observeAnchors(chapter.anchors, new Map()))).toBe("missing");
  });
});

describe("map layout", () => {
  it("fills the unit square and keeps input order", () => {
    const tiles = layoutTiles([{ item: "a", weight: 3 }, { item: "b", weight: 1 }, { item: "c", weight: 1 }]);
    expect(tiles.map((t) => t.item)).toEqual(["a", "b", "c"]);
    expect(tiles.reduce((s, t) => s + t.rect.w * t.rect.h, 0)).toBeCloseTo(1);
  });

  it("counts leaves per directory", () => {
    const idx = indexMap([
      { id: "src", parent: null, kind: "directory", size: null, pullRequests: [], sessions: [] },
      { id: "src/a.ts", parent: "src", kind: "file", size: null, pullRequests: [], sessions: [] },
      { id: "src/b.ts", parent: "src", kind: "file", size: null, pullRequests: [], sessions: [] },
    ]);
    expect(idx.leaves.get("src")).toBe(2);
  });
});

describe("initiative provider operations", () => {
  const url = "https://github.com/o/r/pull/7";
  const init = (): ChangeInitiative => ({ id: "i", scope: "s", name: "n", steps: [{ id: "a", repository: "/r", branch: "f", headSha: "pin", pullRequestUrl: url, dependsOn: [], status: "pending" }] });
  const pr = (state: string, head = "pin") => ({ number: 7, state, html_url: url, head_sha: head, source_branch: "f" });

  it("parses provider PR numbers", () => {
    expect(prNumberFromUrl(url)).toBe(7);
    expect(prNumberFromUrl("https://gitlab.com/o/r/-/merge_requests/12")).toBe(12);
    expect(prNumberFromUrl(undefined)).toBeNull();
  });

  it("completes only after the provider reads back merged at the pinned head", async () => {
    let merged = false;
    const t = vi.fn(async (cmd: string) => {
      if (cmd === "pr_detail") return pr(merged ? "merged" : "open");
      if (cmd === "pr_merge") { merged = true; return { merged: true, message: null }; }
      throw new Error(cmd);
    }) as AgentReviewInvoke;
    const saves: string[] = [];
    const out = await mergeStep(init(), "a", "squash", (i) => saves.push(i.steps[0].status), t);
    expect(out.steps[0].status).toBe("done");
    expect(saves).toEqual(["running", "done"]);
  });

  it("fails without merging when the head moved, and a provider-reported merge is not trusted at another head", async () => {
    const t = vi.fn(async (cmd: string) => {
      if (cmd === "pr_detail") return pr("open", "other");
      throw new Error(`unexpected ${cmd}`);
    }) as AgentReviewInvoke;
    const out = await mergeStep(init(), "a", "merge", () => {}, t);
    expect(out.steps[0].status).toBe("failed");
    expect(out.steps[0].error).toMatch(/Head moved/);
    const running: ChangeInitiative = { ...init(), steps: [{ ...init().steps[0], status: "running" }] };
    const resolved = await resolveRunningStep(running, "a", (async () => pr("merged", "other")) as AgentReviewInvoke);
    expect(resolved.steps[0].status).toBe("failed");
  });

  it("pins pr_merge to the checked head so a push between preflight and mutation merges nothing", async () => {
    const A = "a".repeat(40), B = "b".repeat(40);
    // Simulated provider: head is A at preflight, a push moves it to B before the merge mutation.
    let head = A, merged: string | null = null;
    const merges: Record<string, unknown>[] = [];
    const t = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "pr_detail") {
        const out = { number: 7, state: merged ? "merged" : "open", html_url: url, head_sha: merged ?? head, source_branch: "f" };
        head = B;
        return out;
      }
      if (cmd === "pr_merge") {
        merges.push(args!);
        // Server-side conditional merge (GitHub `sha` / GitLab `sha`): drift rejects before mutation.
        if (args!.expectedHeadSha !== head) throw new Error("Head branch was modified. Review and try the merge again.");
        merged = head;
        return { merged: true, message: null };
      }
      throw new Error(cmd);
    }) as AgentReviewInvoke;
    const pinned: ChangeInitiative = { ...init(), steps: [{ ...init().steps[0], headSha: A }] };
    const saves: string[] = [];
    const out = await mergeStep(pinned, "a", "squash", (i) => saves.push(i.steps[0].status), t);
    expect(merges).toEqual([expect.objectContaining({ expectedHeadSha: A, number: 7 })]);
    expect(merged).toBeNull();
    expect(out.steps[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/Head branch was modified/) });
    expect(saves).toEqual(["running", "failed"]);
    // Resumable: retrying re-checks and refuses the unreviewed head without another merge attempt.
    const retry = await mergeStep(out, "a", "squash", () => {}, t);
    expect(retry.steps[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/Head moved/) });
    expect(merges).toHaveLength(1);
  });

  it("fails when merge succeeded per the call but the provider does not show it merged", async () => {
    const t = vi.fn(async (cmd: string) => (cmd === "pr_detail" ? pr("open") : { merged: false, message: "blocked by review" })) as AgentReviewInvoke;
    const out = await mergeStep(init(), "a", "merge", () => {}, t);
    expect(out.steps[0]).toMatchObject({ status: "failed", error: "blocked by review" });
  });
});
