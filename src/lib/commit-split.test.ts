import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import {
  COLLECT_GROUP_ID,
  SplitPlanError,
  addSplitGroup,
  applySplitPlan,
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

describe("applySplitPlan", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  const units: SplitUnit[] = buildSplitUnits(inputs());

  function mockDiffs() {
    invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
      if (command !== "repo_file_diff") return undefined;
      const file = args.file as string;
      if (file === "src/app.ts") {
        return { staged: null, unstaged: APP_DIFF, untracked_plain: null, is_binary: false };
      }
      return { staged: null, unstaged: DOC_DIFF, untracked_plain: null, is_binary: false };
    });
  }

  it("stages and commits every group in order", async () => {
    mockDiffs();
    const plan: SplitPlan = {
      groups: [
        { id: "g1", message: "feat: code", rationale: "", unitIds: ["u1", "u2"] },
        { id: "g2", message: "docs: text", rationale: "", unitIds: ["u3", "u4"] },
      ],
    };
    const progress: string[] = [];
    const result = await applySplitPlan({
      path: "/repo",
      plan,
      units,
      onProgress: (p) => progress.push(`${p.groupIndex}:${p.phase}`),
    });

    expect(result).toEqual({ committed: 2, cancelled: false, remaining: 0 });
    expect(progress).toEqual(["0:staging", "0:committing", "1:staging", "1:committing"]);

    const commits = invoke.mock.calls.filter(([c]) => c === "commit_changes");
    expect(commits.map(([, args]) => (args as { message: string }).message)).toEqual([
      "feat: code",
      "docs: text",
    ]);
    const staged = invoke.mock.calls.filter(([c]) => c === "stage_hunk");
    expect(staged).toHaveLength(3);
    expect(invoke.mock.calls.filter(([c]) => c === "stage_files")).toHaveLength(1);
    expect(invoke.mock.calls.filter(([c]) => c === "unstage_files")).toHaveLength(2);
  });

  it("stops cleanly between two groups when cancelled", async () => {
    mockDiffs();
    const plan: SplitPlan = {
      groups: [
        { id: "g1", message: "feat: code", rationale: "", unitIds: ["u1", "u2"] },
        { id: "g2", message: "docs: text", rationale: "", unitIds: ["u3", "u4"] },
      ],
    };
    let done = 0;
    const result = await applySplitPlan({
      path: "/repo",
      plan,
      units,
      onProgress: (p) => {
        if (p.phase === "committing") done += 1;
      },
      shouldCancel: () => done >= 1,
    });

    expect(result).toEqual({ committed: 1, cancelled: true, remaining: 1 });
    expect(invoke.mock.calls.filter(([c]) => c === "commit_changes")).toHaveLength(1);
  });

  it("skips empty groups", async () => {
    mockDiffs();
    const plan: SplitPlan = {
      groups: [
        { id: "g1", message: "feat: code", rationale: "", unitIds: [] },
        { id: "g2", message: "docs: text", rationale: "", unitIds: ["u1", "u2", "u3", "u4"] },
      ],
    };
    const result = await applySplitPlan({ path: "/repo", plan, units });
    expect(result.committed).toBe(1);
  });

  it("fails loudly when a planned hunk is no longer in the working tree", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command !== "repo_file_diff") return undefined;
      return { staged: null, unstaged: DOC_DIFF, untracked_plain: null, is_binary: false };
    });
    const plan: SplitPlan = {
      groups: [{ id: "g1", message: "feat: code", rationale: "", unitIds: ["u1"] }],
    };
    await expect(applySplitPlan({ path: "/repo", plan, units })).rejects.toBeInstanceOf(
      SplitPlanError,
    );
    expect(invoke.mock.calls.filter(([c]) => c === "commit_changes")).toHaveLength(0);
  });
});
