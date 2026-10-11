import { describe, expect, it } from "vitest";
import { buildChangeRows, type ChangeRow, type FileDiffResponse } from "@/components/repo/commit/commit-panel-types";
import type { StatusEntry } from "./repo-store";
import { changeTreeItems } from "./change-tree";
import {
  captureDiscardDiffs, changedDiscardContents, changedDiscardPaths, discardFileTotals,
  discardPlanGroups, discardPlanVerified, makeDiscardPlan, refreshDiscardPlan, rowStagingAction, visibleSelectionRange,
} from "./commit-actions";

const partial: StatusEntry = {
  path: "src/app.ts", index_status: "M", worktree_status: "M", staged: true, unstaged: true,
  untracked: false, binary: false, embedded_repo: false,
  additions_staged: 4, deletions_staged: 2, additions_unstaged: 3, deletions_unstaged: 1,
};
const diff: FileDiffResponse = { staged: "staged patch", unstaged: "worktree patch", untracked_plain: null, is_binary: false, fingerprint: "snapshot-token" };
const row = (entry: StatusEntry, sector: "staged" | "unstaged"): ChangeRow => ({ id: `${sector}:${entry.path}`, path: entry.path, entry, sector });

describe("sector-specific staging", () => {
  it("unstages the staged row of a partially staged file without staging its remaining changes", () => {
    const rows = buildChangeRows([partial]);
    expect(rows.map(rowStagingAction)).toEqual(["unstage", "stage"]);
  });

  it("protects conflicts and embedded repositories from generic staging", () => {
    expect(rowStagingAction({ ...row(partial, "staged"), sector: "conflict" })).toBeNull();
    expect(rowStagingAction(row({ ...partial, embedded_repo: true }, "unstaged"))).toBeNull();
  });
});

describe("visible Shift ranges", () => {
  it("uses rendered tree order and excludes collapsed folder children", () => {
    const rows = [row({ ...partial, path: "README.md" }, "unstaged"), row({ ...partial, path: "src/a.ts" }, "unstaged"), row({ ...partial, path: "src/z.ts" }, "unstaged"), row({ ...partial, path: "tools/test.ts" }, "unstaged")];
    const visible = changeTreeItems(rows, new Set(["unstaged:tools"]), "unstaged:").flatMap((item) => item.type === "file" ? [item.row.id] : []);
    expect(visible).toEqual(["unstaged:src/a.ts", "unstaged:src/z.ts", "unstaged:README.md"]);
    expect(visibleSelectionRange(visible, "unstaged:src/z.ts", "unstaged:README.md")).toEqual(["unstaged:src/z.ts", "unstaged:README.md"]);
  });

  it("selects only the clicked visible row when a previous anchor is filtered or collapsed", () => {
    expect(visibleSelectionRange(["b", "d"], "a", "d")).toEqual(["d"]);
    expect(visibleSelectionRange(["b", "d"], "d", "b")).toEqual(["b", "d"]);
  });
});

describe("scoped discard plans", () => {
  it("preserves staged content for an unstaged selection even when another selected file is staged", () => {
    const other = { ...partial, path: "other.ts" };
    const plan = makeDiscardPlan("/repo", [row(partial, "unstaged"), row(other, "staged")]);
    expect(plan.files.map(({ path, scope }) => [path, scope])).toEqual([[partial.path, "worktree"], [other.path, "all"]]);
    expect(discardPlanGroups(plan).map(({ scope, files }) => [scope, files.map((file) => file.path)])).toEqual([["worktree", [partial.path]], ["all", [other.path]]]);
    expect(discardFileTotals(plan.files[0])).toEqual({ additions: 3, deletions: 1 });
    expect(discardFileTotals(plan.files[1])).toEqual({ additions: 7, deletions: 3 });
  });

  it("deduplicates a file present in both sectors and clearly broadens only its own scope", () => {
    const plan = makeDiscardPlan("/repo", [row(partial, "unstaged"), row(partial, "staged"), row(partial, "unstaged")]);
    expect(plan.files).toHaveLength(1);
    expect(plan.files[0].scope).toBe("all");
    partial.additions_staged += 1;
    expect(plan.files[0].entry.additions_staged).toBe(4);
    partial.additions_staged -= 1;
  });

  it("excludes unresolved conflicts and embedded repository contents", () => {
    const conflict = { ...partial, index_status: "U", worktree_status: "U" };
    expect(makeDiscardPlan("/repo", [...buildChangeRows([conflict]), row({ ...partial, embedded_repo: true }, "unstaged")]).files).toEqual([]);
  });

  it("detects changed flags, missing files and newly introduced conflicts", () => {
    const plan = makeDiscardPlan("/repo", [row(partial, "unstaged")]);
    expect(changedDiscardPaths(plan, [{ ...partial }])).toEqual([]);
    expect(changedDiscardPaths(plan, [{ ...partial, untracked: true }])).toEqual([partial.path]);
    expect(changedDiscardPaths(plan, [{ ...partial, index_status: "U", worktree_status: "U" }])).toEqual([partial.path]);
    expect(changedDiscardPaths(plan, [])).toEqual([partial.path]);
  });

  it("refreshes remaining files while preserving the reviewed per-file scope", () => {
    const plan = makeDiscardPlan("/repo", [row(partial, "staged"), row({ ...partial, path: "done.ts" }, "unstaged")]);
    const refreshed = refreshDiscardPlan(plan, [{ ...partial, staged: false, index_status: " " }]);
    expect(refreshed.files).toHaveLength(1);
    expect(refreshed.files[0].scope).toBe("all");
    expect(refreshed.files[0].entry.staged).toBe(false);
  });

  it("detects same-count text edits and compares only the scope to be discarded", async () => {
    const worktreePlan = await captureDiscardDiffs(makeDiscardPlan("/repo", [row(partial, "unstaged")]), async () => diff);
    const indexEdited = await captureDiscardDiffs(worktreePlan, async () => ({ ...diff, staged: "new staged patch" }));
    expect(changedDiscardContents(worktreePlan, indexEdited)).toEqual([]);
    const contentEdited = await captureDiscardDiffs(worktreePlan, async () => ({ ...diff, unstaged: "same count, different data" }));
    expect(changedDiscardContents(worktreePlan, contentEdited)).toEqual([partial.path]);
    const allPlan = await captureDiscardDiffs(makeDiscardPlan("/repo", [row(partial, "staged")]), async () => diff);
    expect(changedDiscardContents(allPlan, indexEdited)).toEqual([partial.path]);
  });

  it("compares untracked text and never authorizes a plan without captured content", async () => {
    const untracked = { ...partial, staged: false, untracked: true };
    const plan = makeDiscardPlan("/repo", [row(untracked, "unstaged")]);
    expect(changedDiscardContents(plan, plan)).toEqual([partial.path]);
    const captured = await captureDiscardDiffs(plan, async () => ({ ...diff, staged: null, unstaged: null, untracked_plain: "draft" }));
    const changed = await captureDiscardDiffs(plan, async () => ({ ...diff, staged: null, unstaged: null, untracked_plain: "other" }));
    expect(changedDiscardContents(captured, changed)).toEqual([partial.path]);
  });

  it("bounds concurrent file reads and retains the preview order", async () => {
    const files = Array.from({ length: 11 }, (_, i) => row({ ...partial, path: `${i}.ts` }, "unstaged"));
    let running = 0;
    let maximum = 0;
    const captured = await captureDiscardDiffs(makeDiscardPlan("/repo", files), async () => {
      maximum = Math.max(maximum, ++running);
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return diff;
    });
    expect(maximum).toBe(4);
    expect(captured.files.map((file) => file.path)).toEqual(files.map((file) => file.path));
  });

  it("requires verified snapshots and detects binary bytes changing while status stays identical", async () => {
    const plan = makeDiscardPlan("/repo", [row({ ...partial, binary: true }, "unstaged")]);
    expect(discardPlanVerified(plan)).toBe(false);
    const old = await captureDiscardDiffs(plan, async () => ({ ...diff, staged: null, unstaged: null, is_binary: true, fingerprint: "binary-before" }));
    const changed = await captureDiscardDiffs(plan, async () => ({ ...diff, staged: null, unstaged: null, is_binary: true, fingerprint: "binary-after" }));
    expect(discardPlanVerified(old)).toBe(true);
    expect(changedDiscardPaths(old, [{ ...partial, binary: true }])).toEqual([]);
    expect(changedDiscardContents(old, changed)).toEqual([partial.path]);
    expect(discardPlanVerified({ ...old, files: old.files.map((file) => ({ ...file, diff: { ...diff, fingerprint: null } })) })).toBe(false);
  });
});
