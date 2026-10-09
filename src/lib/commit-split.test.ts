import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import {
  COLLECT_GROUP_ID,
  SplitPlanError,
  addSplitGroup,
  applySplitPlan,
  collectSplitInputs,
  readCommitSplitSnapshot,
  buildSplitPrompt,
  buildSplitUnits,
  fileNeedsWholeUnit,
  hunkSignature,
  matchUnitsToHunks,
  moveUnits,
  parseSplitResponse,
  planIssues,
  planUnitIds,
  removeSplitGroup,
  renameSplitGroup,
  selectionKeysForHunks,
  unitLabel,
  unitTotals,
  validateSplitPlan,
  type SplitFileInput,
  type CommitSplitSnapshot,
  type SplitPlan,
  type SplitUnit,
} from "@/lib/commit-split";
import { parseDiffWithHunks } from "@/lib/unified-diff";
import type { StatusEntry } from "@/lib/repo-store";

const APP_DIFF = [
  "diff --git a/src/app.ts b/src/app.ts",
  "index 1111111..2222222 100644",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -1,4 +1,5 @@",
  " import x from 'x';",
  "+import y from 'y';",
  " ",
  " export function app() {",
  " }",
  "@@ -20,3 +21,4 @@ export function app() {",
  " const a = 1;",
  "+const b = 2;",
  " const c = 3;",
  "",
].join("\n");

const DOC_DIFF = [
  "diff --git a/README.md b/README.md",
  "index 3333333..4444444 100644",
  "--- a/README.md",
  "+++ b/README.md",
  "@@ -1,3 +1,3 @@",
  " # title",
  "-old line",
  "+new line",
  " tail",
  "",
].join("\n");

function inputs(): SplitFileInput[] {
  return [
    {
      file: "src/app.ts",
      diff: APP_DIFF,
      wholeFile: false,
      untracked: false,
      binary: false,
      additions: 2,
      deletions: 0,
    },
    {
      file: "README.md",
      diff: DOC_DIFF,
      wholeFile: false,
      untracked: false,
      binary: false,
      additions: 1,
      deletions: 1,
    },
    {
      file: "assets/logo.png",
      diff: null,
      wholeFile: true,
      untracked: true,
      binary: true,
      additions: 0,
      deletions: 0,
    },
  ];
}

function statusEntry(overrides: Partial<StatusEntry>): StatusEntry {
  return {
    path: "f.ts",
    index_status: " ",
    worktree_status: "M",
    staged: false,
    unstaged: true,
    untracked: false,
    additions_staged: 0,
    deletions_staged: 0,
    additions_unstaged: 1,
    deletions_unstaged: 0,
    binary: false,
    embedded_repo: false,
    ...overrides,
  };
}

describe("buildSplitUnits", () => {
  it("creates one unit per hunk and one unit per whole file", () => {
    const units = buildSplitUnits(inputs());
    expect(units.map((u) => u.id)).toEqual(["u1", "u2", "u3", "u4"]);
    expect(units.map((u) => u.kind)).toEqual(["hunk", "hunk", "hunk", "file"]);
    expect(units[0].file).toBe("src/app.ts");
    expect(units[0].additions).toBe(1);
    expect(units[2].file).toBe("README.md");
    expect(units[2].deletions).toBe(1);
    expect(units[3]).toMatchObject({ file: "assets/logo.png", untracked: true, binary: true });
  });

  it("falls back to a file unit when the diff is empty", () => {
    const units = buildSplitUnits([
      {
        file: "empty.ts",
        diff: "",
        wholeFile: false,
        untracked: false,
        binary: false,
        additions: 0,
        deletions: 0,
      },
    ]);
    expect(units).toHaveLength(1);
    expect(units[0].kind).toBe("file");
  });

  it("labels hunks with their working-tree line range", () => {
    const units = buildSplitUnits(inputs());
    expect(unitLabel(units[0])).toBe("src/app.ts:1-5");
    expect(unitLabel(units[3])).toBe("assets/logo.png");
  });

  it("sums totals across units", () => {
    expect(unitTotals(buildSplitUnits(inputs()))).toEqual({
      units: 4,
      files: 3,
      additions: 3,
      deletions: 1,
    });
  });
});

describe("fileNeedsWholeUnit", () => {
  it("treats untracked, binary, deleted and renamed files as whole units", () => {
    expect(fileNeedsWholeUnit(statusEntry({ untracked: true }))).toBe(true);
    expect(fileNeedsWholeUnit(statusEntry({ binary: true }))).toBe(true);
    expect(fileNeedsWholeUnit(statusEntry({ worktree_status: "D" }))).toBe(true);
    expect(fileNeedsWholeUnit(statusEntry({ index_status: "R" }))).toBe(true);
    expect(fileNeedsWholeUnit(statusEntry({}))).toBe(false);
  });
});

describe("buildSplitPrompt", () => {
  it("lists every unit id and keeps the char budget", () => {
    const units = buildSplitUnits(inputs());
    const prompt = buildSplitPrompt(units, { language: "German" });
    for (const unit of units) expect(prompt).toContain(`--- ${unit.id} |`);
    expect(prompt).toContain("German");
  });

  it("omits diff bodies once the budget is exhausted", () => {
    const units = buildSplitUnits(inputs());
    const prompt = buildSplitPrompt(units, { maxChars: 120 });
    expect(prompt).toContain("budget reached");
    for (const unit of units) expect(prompt).toContain(`--- ${unit.id} |`);
  });
});

describe("parseSplitResponse", () => {
  it("parses a raw JSON answer", () => {
    const groups = parseSplitResponse(
      '{"groups":[{"message":"feat: a","rationale":"r","units":["u1"]}]}',
    );
    expect(groups).toEqual([{ message: "feat: a", rationale: "r", units: ["u1"] }]);
  });

  it("parses a fenced answer with surrounding prose", () => {
    const groups = parseSplitResponse(
      'Sure!\n```json\n{"groups":[{"message":"fix: b","units":["u2","u3"]}]}\n```\n',
    );
    expect(groups[0].units).toEqual(["u2", "u3"]);
    expect(groups[0].rationale).toBe("");
  });

  it("throws on garbage", () => {
    expect(() => parseSplitResponse("no json here")).toThrow(SplitPlanError);
    expect(() => parseSplitResponse("{not json}")).toThrow(SplitPlanError);
    expect(() => parseSplitResponse('{"foo":1}')).toThrow(SplitPlanError);
  });

  it("drops non-string unit ids", () => {
    const groups = parseSplitResponse('{"groups":[{"message":"m","units":["u1",7,null]}]}');
    expect(groups[0].units).toEqual(["u1"]);
  });
});

describe("validateSplitPlan", () => {
  const units = buildSplitUnits(inputs());

  it("accepts a complete assignment", () => {
    const result = validateSplitPlan(units, [
      { message: "feat: code", rationale: "r1", units: ["u1", "u2"] },
      { message: "docs: text", rationale: "r2", units: ["u3", "u4"] },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(planUnitIds(result.plan)).toEqual(["u1", "u2", "u3", "u4"]);
    expect(result.warnings).toEqual([]);
  });

  it("drops unknown ids with a warning", () => {
    const result = validateSplitPlan(units, [
      { message: "feat: code", rationale: "", units: ["u1", "u99", "u2", "u3", "u4"] },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(planUnitIds(result.plan)).toEqual(["u1", "u2", "u3", "u4"]);
    expect(result.warnings.join(" ")).toContain("u99");
  });

  it("rejects duplicate assignments", () => {
    const result = validateSplitPlan(units, [
      { message: "a", rationale: "", units: ["u1", "u2", "u3", "u4"] },
      { message: "b", rationale: "", units: ["u1"] },
    ]);
    expect(result).toEqual({ ok: false, reason: "unit u1 was assigned more than once" });
  });

  it("rejects an incomplete assignment", () => {
    const result = validateSplitPlan(units, [{ message: "a", rationale: "", units: ["u1"] }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("u2");
  });

  it("rejects groups without a message", () => {
    const result = validateSplitPlan(units, [
      { message: "", rationale: "", units: ["u1", "u2", "u3", "u4"] },
    ]);
    expect(result.ok).toBe(false);
  });

  it("skips groups that only contained unknown ids", () => {
    const result = validateSplitPlan(units, [
      { message: "", rationale: "", units: ["nope"] },
      { message: "a", rationale: "", units: ["u1", "u2", "u3", "u4"] },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.groups).toHaveLength(1);
  });
});

describe("plan editing", () => {
  const units = buildSplitUnits(inputs());
  const base: SplitPlan = {
    groups: [
      { id: "g1", message: "feat: code", rationale: "", unitIds: ["u1", "u2"] },
      { id: "g2", message: "docs: text", rationale: "", unitIds: ["u3", "u4"] },
    ],
  };

  it("moves units between groups without losing coverage", () => {
    const next = moveUnits(base, ["u2"], "g2");
    expect(next.groups[0].unitIds).toEqual(["u1"]);
    expect(next.groups[1].unitIds).toEqual(["u3", "u4", "u2"]);
    expect(planIssues(next, units)).toEqual([]);
  });

  it("ignores moves into an unknown group", () => {
    expect(moveUnits(base, ["u1"], "nope")).toBe(base);
  });

  it("keeps a group when all of its units leave", () => {
    const next = moveUnits(base, ["u1", "u2"], "g2");
    expect(next.groups).toHaveLength(2);
    expect(next.groups[0].unitIds).toEqual([]);
    expect(planIssues(next, units)).toEqual([]);
  });

  it("moves units of a deleted group into the collect group", () => {
    const next = removeSplitGroup(base, "g1", "chore: rest");
    expect(next.groups.map((g) => g.id)).toEqual(["g2", COLLECT_GROUP_ID]);
    expect(next.groups[1].unitIds).toEqual(["u1", "u2"]);
    expect(planIssues(next, units)).toEqual([]);
  });

  it("reuses an existing collect group", () => {
    const once = removeSplitGroup(
      addSplitGroup(base, "chore: extra"),
      "g1",
      "chore: rest",
    );
    const twice = removeSplitGroup(once, "g2", "chore: rest");
    expect(twice.groups.filter((g) => g.id === COLLECT_GROUP_ID)).toHaveLength(1);
    expect(twice.groups.find((g) => g.id === COLLECT_GROUP_ID)?.unitIds).toEqual([
      "u1",
      "u2",
      "u3",
      "u4",
    ]);
  });

  it("never removes the last group", () => {
    const single: SplitPlan = { groups: [base.groups[0]] };
    expect(removeSplitGroup(single, "g1", "chore: rest")).toBe(single);
  });

  it("renames and appends groups with fresh ids", () => {
    const renamed = renameSplitGroup(base, "g2", "docs: better");
    expect(renamed.groups[1].message).toBe("docs: better");
    const added = addSplitGroup(renamed, "chore: new");
    expect(added.groups.map((g) => g.id)).toEqual(["g1", "g2", "g3"]);
    expect(added.groups[2].unitIds).toEqual([]);
  });

  it("reports coverage and message issues", () => {
    const broken: SplitPlan = {
      groups: [{ id: "g1", message: "", unitIds: ["u1"], rationale: "" }],
    };
    expect(planIssues(broken, units)).toEqual(["coverage", "message"]);
  });
});

describe("matchUnitsToHunks", () => {
  it("matches hunks by their change signature even when line numbers moved", () => {
    const original = parseDiffWithHunks(APP_DIFF);
    const shifted = parseDiffWithHunks(
      APP_DIFF.replace("@@ -20,3 +21,4 @@", "@@ -40,3 +41,4 @@"),
    );
    const signature = hunkSignature(original.hunks[1]);
    expect(matchUnitsToHunks(shifted, [signature])).toEqual({ indices: [1], missing: [] });
  });

  it("reports signatures that are gone", () => {
    const parsed = parseDiffWithHunks(DOC_DIFF);
    const result = matchUnitsToHunks(parsed, ["+vanished"]);
    expect(result.indices).toEqual([]);
    expect(result.missing).toEqual(["+vanished"]);
  });

  it("consumes duplicate signatures one by one", () => {
    const doubled = [
      "diff --git a/d.ts b/d.ts",
      "--- a/d.ts",
      "+++ b/d.ts",
      "@@ -1,2 +1,3 @@",
      " a",
      "+dup",
      " b",
      "@@ -30,2 +31,3 @@",
      " a",
      "+dup",
      " b",
      "",
    ].join("\n");
    const parsed = parseDiffWithHunks(doubled);
    expect(matchUnitsToHunks(parsed, ["+dup", "+dup"]).indices).toEqual([0, 1]);
  });

  it("selects every change line of the matched hunks", () => {
    const parsed = parseDiffWithHunks(APP_DIFF);
    expect([...selectionKeysForHunks(parsed, [1])]).toEqual(["1:1"]);
  });
});

const snapshot: CommitSplitSnapshot = Object.freeze({ head: "1".repeat(40), branch: "main",
  indexFingerprint: "initial index", worktreeFingerprint: " original raw worktree token " });
function nextSnapshot(index: number, expected = snapshot): CommitSplitSnapshot {
  return { ...expected, head: (index + 2).toString(16).repeat(40), indexFingerprint: `index after ${index + 1}` };
}
function groupPlan(units: readonly SplitUnit[]): SplitPlan {
  return { groups: units.map((unit, index) => ({ id: `g${index}`, message: `group ${index}`, rationale: "", unitIds: [unit.id] })) };
}

describe("applySplitPlan checked transaction contract", () => {
  beforeEach(() => { invoke.mockReset(); });
  const units = buildSplitUnits(inputs());
  const plan: SplitPlan = { groups: [
    { id: "g1", message: "feat: code", rationale: "", unitIds: ["u1", "u2"] },
    { id: "g2", message: "docs: text", rationale: "", unitIds: ["u3", "u4"] },
  ] };
  function mockDiffs(afterCommit?: () => void) {
    let committed = 0;
    invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
      if (command === "git_commit_split_group_checked") { const next = nextSnapshot(committed++); afterCommit?.(); return next; }
      if (command === "repo_file_diff") return { staged: null, unstaged: args.file === "src/app.ts" ? APP_DIFF : DOC_DIFF,
        untracked_plain: null, is_binary: false };
      throw Error(`Unexpected command ${command}`);
    });
  }
  it("commits each group with one checked RPC carrying all reviewed exact paths and the previous snapshot", async () => {
    mockDiffs(); const progress: string[] = [];
    const result = await applySplitPlan({ path: "/repo ", plan, units, snapshot, sign: false,
      onProgress: p => progress.push(`${p.groupIndex}:${p.phase}`) });
    expect(result).toEqual({ committed: 2, cancelled: false, remaining: 0 });
    expect(progress).toEqual(["0:staging", "0:committing", "1:staging", "1:committing"]);
    const commits = invoke.mock.calls.filter(([command]) => command === "git_commit_split_group_checked");
    expect(commits).toHaveLength(2);
    expect(commits[0][1]).toMatchObject({ path: "/repo ", files: ["src/app.ts", "README.md", "assets/logo.png"],
      expected: snapshot, message: "feat: code", sign: false, selections: [{ file: "src/app.ts", patches: [expect.any(String), expect.any(String)] }] });
    expect(commits[1][1]).toMatchObject({ expected: nextSnapshot(0), message: "docs: text", selections: [
      { file: "README.md", patches: [expect.any(String)] }, { file: "assets/logo.png", patches: null } ] });
    expect(invoke.mock.calls.some(([command]) => ["repo_staged_diff", "unstage_files", "stage_files", "stage_hunk", "commit_changes"].includes(command))).toBe(false);
    expect(snapshot.worktreeFingerprint).toBe(" original raw worktree token ");
  });
  it("stops between groups after an in-flight checked commit succeeds", async () => {
    let done = 0; mockDiffs(() => { done += 1; });
    expect(await applySplitPlan({ path: "/repo", plan, units, snapshot, shouldCancel: () => done >= 1 }))
      .toEqual({ committed: 1, cancelled: true, remaining: 1 });
    expect(invoke.mock.calls.filter(([command]) => command === "git_commit_split_group_checked")).toHaveLength(1);
  });
  it("cancels after fresh diff reads before invoking any transaction", async () => {
    mockDiffs(); let cancelled = false;
    expect(await applySplitPlan({ path: "/repo", plan, units, snapshot,
      onProgress: p => { if (p.phase === "committing") cancelled = true; }, shouldCancel: () => cancelled }))
      .toEqual({ committed: 0, cancelled: true, remaining: 2 });
    expect(invoke.mock.calls.some(([command]) => command === "git_commit_split_group_checked")).toBe(false);
  });
  it("skips empty groups while retaining complete selection coverage", async () => {
    mockDiffs();
    expect((await applySplitPlan({ path: "/repo", snapshot, units, plan: { groups: [
      { id: "empty", message: "unused", rationale: "", unitIds: [] },
      { id: "all", message: "all units", rationale: "", unitIds: units.map(unit => unit.id) },
    ] } })).committed).toBe(1);
  });
  it("rejects missing or extra remaining hunk identity before any native transaction", async () => {
    invoke.mockImplementation(async () => ({ staged: null, unstaged: DOC_DIFF, untracked_plain: null, is_binary: false }));
    await expect(applySplitPlan({ path: "/repo", plan, units, snapshot })).rejects.toMatchObject({ preserveStaging: true });
    expect(invoke.mock.calls.some(([command]) => command === "git_commit_split_group_checked")).toBe(false);
  });
  it("sends the original token when staging changes immediately before the checked RPC and preserves the rejection", async () => {
    let changed = false;
    invoke.mockImplementation(async (command: string) => {
      if (command === "git_commit_split_group_checked") { expect(changed).toBe(true); throw Error("__SPLIT_STAGING_CHANGED__"); }
      return { staged: null, unstaged: APP_DIFF, untracked_plain: null, is_binary: false };
    });
    const selected = units.slice(0, 2);
    await expect(applySplitPlan({ path: "/repo", snapshot, units: selected,
      plan: { groups: [{ id: "all", message: "code", rationale: "", unitIds: selected.map(unit => unit.id) }] },
      onProgress: p => { if (p.phase === "committing") changed = true; },
    })).rejects.toMatchObject({ message: "__SPLIT_STAGING_CHANGED__", preserveStaging: true });
    const commits = invoke.mock.calls.filter(([command]) => command === "git_commit_split_group_checked");
    expect(commits).toHaveLength(1); expect(commits[0][1].expected).toEqual(snapshot);
    expect(invoke.mock.calls.some(([command]) => ["unstage_files", "stage_files", "stage_hunk", "commit_changes"].includes(command))).toBe(false);
  });
  it("freezes caller snapshot and plan values before asynchronous reads", async () => {
    const expected = { ...snapshot }; const sourcePlan = structuredClone(plan); const sourceUnits = structuredClone(units);
    mockDiffs(); const pending = applySplitPlan({ path: "/repo", plan: sourcePlan, units: sourceUnits, snapshot: expected });
    expected.worktreeFingerprint = "newly adopted bytes"; sourcePlan.groups[0].message = "unreviewed message";
    sourcePlan.groups[0].unitIds.length = 0; sourceUnits[0].file = "other";
    await pending;
    const commits = invoke.mock.calls.filter(([command]) => command === "git_commit_split_group_checked");
    expect(commits[0][1]).toMatchObject({ expected: snapshot, message: "feat: code" });
    expect(Object.isFrozen(commits[0][1].expected)).toBe(true);
  });
  it.each([undefined, null, {}, { ...snapshot, head: "short" }, { ...snapshot, indexFingerprint: "" }, { ...snapshot, branch: undefined }])
    ("rejects malformed initial snapshots without commands", async invalid => {
      await expect(applySplitPlan({ path: "/repo", plan, units, snapshot: invalid as CommitSplitSnapshot })).rejects.toMatchObject({ preserveStaging: true });
      expect(invoke).not.toHaveBeenCalled();
    });
  it.each([undefined, { ...snapshot, head: "2".repeat(40), worktreeFingerprint: "freshly changed token" },
    { ...snapshot, head: "2".repeat(40), branch: "other" }, snapshot, { ...snapshot, head: null }])
    ("stops after a malformed success instead of requesting further commits", async reply => {
      const whole = buildSplitUnits(inputs().map(input => ({ ...input, wholeFile: true })));
      invoke.mockResolvedValue(reply);
      await expect(applySplitPlan({ path: "/repo", plan: groupPlan(whole), units: whole, snapshot })).rejects.toMatchObject({ preserveStaging: true });
      expect(invoke).toHaveBeenCalledOnce();
      expect(invoke.mock.calls[0][0]).toBe("git_commit_split_group_checked");
    });
});

describe("split collection snapshot provenance", () => {
  beforeEach(() => { invoke.mockReset(); });
  it("binds all exact file paths and diff reads between identical snapshots", async () => {
    const file = "README.md \n";
    invoke.mockImplementation(async (command: string) => {
      if (command === "repo_status") return [statusEntry({ path: file })];
      if (command === "git_commit_split_snapshot") return snapshot;
      if (command === "repo_file_diff") return { staged: null, unstaged: DOC_DIFF, is_binary: false, untracked_plain: null };
      throw Error(`Unexpected command ${command}`);
    });
    const collected = await collectSplitInputs("/repo ");
    expect(collected.snapshot).toEqual(snapshot);
    expect(collected.units[0].file).toBe(file);
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(["repo_status", "git_commit_split_snapshot", "repo_file_diff", "git_commit_split_snapshot"]);
    expect(invoke.mock.calls.filter(([command]) => command === "git_commit_split_snapshot").map(([,args]) => args)).toEqual([
      { path: "/repo ", files: [file] }, { path: "/repo ", files: [file] } ]);
  });
  it.each(["head", "branch", "indexFingerprint", "worktreeFingerprint"] as const)("rejects collection if %s changes during diff reads", async field => {
    let reads = 0;
    invoke.mockImplementation(async (command: string) => {
      if (command === "repo_status") return [statusEntry({ path: "README.md" })];
      if (command === "git_commit_split_snapshot") return reads++ === 0 ? snapshot : { ...snapshot, [field]: field === "head" ? "2".repeat(40) : "changed" };
      return { staged: null, unstaged: DOC_DIFF, is_binary: false, untracked_plain: null };
    });
    await expect(collectSplitInputs("/repo")).rejects.toMatchObject({ message: "__SPLIT_REVIEW_CHANGED__", preserveStaging: true });
    expect(invoke.mock.calls.some(([command]) => ["unstage_files", "stage_files", "stage_hunk", "commit_changes"].includes(command))).toBe(false);
  });
  it("captures only after authorized flatten and rereads renamed change identities", async () => {
    let status = 0;
    invoke.mockImplementation(async (command: string) => {
      if (command === "repo_status") return status++ === 0 ? [statusEntry({ staged: true })] : [statusEntry({ path: "new.txt", untracked: true })];
      if (command === "unstage_files") return undefined;
      if (command === "git_commit_split_snapshot") return snapshot;
      throw Error(`Unexpected command ${command}`);
    });
    const collected = await collectSplitInputs("/repo");
    expect(collected.hadStaged).toBe(true); expect(collected.units[0].file).toBe("new.txt");
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(["repo_status", "unstage_files", "repo_status", "git_commit_split_snapshot", "git_commit_split_snapshot"]);
  });
  it("does not flatten staging after collection ownership is canceled during its status read", async () => {
    let release!: (value: StatusEntry[]) => void; let cancelled = false;
    invoke.mockReturnValue(new Promise<StatusEntry[]>(resolve => { release = resolve; }));
    const pending = collectSplitInputs("/repo", { shouldCancel: () => cancelled });
    cancelled = true; release([statusEntry({ staged: true })]);
    await expect(pending).rejects.toMatchObject({ preserveStaging: true });
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(["repo_status"]);
  });
  it("accepts SHA256 and unborn branch snapshot contracts without normalizing raw tokens", () => {
    expect(readCommitSplitSnapshot({ ...snapshot, head: "a".repeat(64) }).head).toHaveLength(64);
    expect(readCommitSplitSnapshot({ ...snapshot, head: null }).head).toBeNull();
    expect(readCommitSplitSnapshot(snapshot).worktreeFingerprint).toBe(snapshot.worktreeFingerprint);
  });
});
