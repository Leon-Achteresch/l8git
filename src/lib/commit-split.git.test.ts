import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, lstatSync, existsSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { applySplitPlan, buildSplitUnits, collectSplitInputs,
  type CommitSplitSnapshot, type SplitPlan, type SplitUnit } from "@/lib/commit-split";
import { parseDiffWithHunks } from "@/lib/unified-diff";

const scratchRepos: string[] = [];
afterAll(() => scratchRepos.forEach(path => rmSync(path, { recursive: true, force: true })));

function splitRepo(original: string) {
  const path = mkdtempSync(join(tmpdir(), "l8git-split-identity-"));
  scratchRepos.push(path);
  const run = (...args: string[]) => execFileSync("git", ["-C", path, ...args], { encoding: "utf8" });
  run("init", "-q", "-b", "main");
  run("config", "user.email", "scratch@example.com");
  run("config", "user.name", "Scratch");
  run("config", "commit.gpgsign", "false");
  writeFileSync(join(path, "selected.txt"), original);
  run("add", "--", ".");
  run("commit", "-qm", "base");
  const commands: string[] = [];
  const transactions: Record<string, unknown>[] = [];
  let beforeChecked: (() => void) | undefined;
  let beforeDiff: (() => void) | undefined;
  // This real-Git shim checks the frontend wire contract and resulting commits.
  // Native Rust tests independently cover its lock and index-transaction guarantees.
  const snapshot = (files: readonly string[]): CommitSplitSnapshot => {
    if (run("diff", "--cached", "--no-color").trim()) throw Error("__SPLIT_STAGING_CHANGED__");
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const working = createHash("sha256");
    for (const file of [...files].sort()) {
      working.update(JSON.stringify(file));
      if (!existsSync(join(path, file))) working.update("missing");
      else { working.update(String(lstatSync(join(path, file)).mode)); working.update(readFileSync(join(path, file))); }
    }
    const head = spawnSync("git", ["-C", path, "rev-parse", "--verify", "HEAD"], { encoding: "utf8" });
    const branch = spawnSync("git", ["-C", path, "branch", "--show-current"], { encoding: "utf8" });
    return { head: head.status === 0 ? head.stdout.trim() : null, branch: branch.stdout.trim() || null,
      indexFingerprint: hash(run("ls-files", "-v", "--stage", "-z")), worktreeFingerprint: working.digest("hex") };
  };
  invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
    commands.push(command);
    const files = args.files as string[];
    if (command === "repo_status") {
      const records = run("status", "--porcelain", "-z", "--untracked-files=all").split("\0");
      const entries = [];
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        if (!record) continue;
        const indexStatus = record[0];
        const worktreeStatus = record[1];
        if (indexStatus === "R" || indexStatus === "C") index += 1;
        const untracked = indexStatus === "?" && worktreeStatus === "?";
        entries.push({
          path: record.slice(3), index_status: indexStatus, worktree_status: worktreeStatus,
          staged: !untracked && indexStatus !== " ", unstaged: !untracked && worktreeStatus !== " ",
          untracked, additions_staged: 0, deletions_staged: 0,
          additions_unstaged: 0, deletions_unstaged: 0, binary: false, embedded_repo: false,
        });
      }
      return entries;
    }
    if (command === "git_commit_split_snapshot") return snapshot(files);
    if (command === "repo_file_diff") { beforeDiff?.(); return {
      staged: run("diff", "--cached", "--no-color", "--", args.file as string),
      unstaged: run("diff", "--no-color", "--", args.file as string),
      untracked_plain: null,
      is_binary: false,
    }; }
    if (command === "unstage_files") return run("--literal-pathspecs", "reset", "HEAD", "--", ...files);
    if (command === "git_commit_split_group_checked") {
      transactions.push(args); beforeChecked?.();
      const expected = args.expected as CommitSplitSnapshot;
      const actual = snapshot(files);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error("__SPLIT_REVIEW_CHANGED__");
      for (const selection of args.selections as { file: string; patches: string[] | null }[]) {
        if (selection.patches === null) run("--literal-pathspecs", "add", "--", selection.file);
        else execFileSync("git", ["-C", path, "apply", "--cached", "--whitespace=nowarn"], { input: selection.patches.join("") });
      }
      run("commit", "--no-gpg-sign", "-qm", args.message as string);
      return { ...snapshot(files), worktreeFingerprint: expected.worktreeFingerprint };
    }
    throw new Error(`Unexpected command ${command}`);
  });
  return { path, run, commands, transactions, snapshot,
    beforeChecked: (callback: () => void) => { beforeChecked = callback; },
    beforeDiff: (callback: () => void) => { beforeDiff = callback; },
    write: (text: string) => writeFileSync(join(path, "selected.txt"), text) };
}

function reviewedUnits(diff: string): SplitUnit[] {
  return buildSplitUnits([{
    file: "selected.txt", diff, wholeFile: false, untracked: false,
    binary: false, additions: 2, deletions: 2,
  }]);
}

function orderedPlan(units: readonly SplitUnit[]): SplitPlan {
  return { groups: units.map((unit, index) => ({
    id: `g${index}`, unitIds: [unit.id], message: `group ${index}`, rationale: "",
  })) };
}

for (const destination of ["renamed.txt", "renamed.txt \n"]) {
  it.skipIf(process.platform === "win32" && destination.endsWith("\n"))(
    `collects both sides of a staged rename to ${JSON.stringify(destination)} before committing the complete plan`,
    async () => {
      const fixture = splitRepo("reviewed content\n");
      fixture.run("mv", "--", "selected.txt", destination);
      const collected = await collectSplitInputs(fixture.path);
      expect(collected.hadStaged).toBe(true);
      expect(collected.units.map((unit) => unit.file).sort()).toEqual(["selected.txt", destination].sort());
      expect(collected.units.find((unit) => unit.file === "selected.txt")).toMatchObject({ kind: "file", untracked: false });
      expect(collected.units.find((unit) => unit.file === destination)).toMatchObject({ kind: "file", untracked: true });
      expect(fixture.commands.slice(0, 3)).toEqual(["repo_status", "unstage_files", "repo_status"]);
      const plan: SplitPlan = { groups: [{
        id: "rename", unitIds: collected.units.map((unit) => unit.id),
        message: "rename reviewed file", rationale: "",
      }] };
      await expect(applySplitPlan({ path: fixture.path, units: collected.units, plan, snapshot: collected.snapshot }))
        .resolves.toEqual({ committed: 1, cancelled: false, remaining: 0 });
      expect(fixture.run("ls-tree", "--name-only", "-z", "HEAD")).toBe(`${destination}\0`);
      expect(fixture.run("show", `HEAD:${destination}`)).toBe("reviewed content\n");
      expect(readFileSync(join(fixture.path, destination), "utf8")).toBe("reviewed content\n");
      expect(fixture.run("status", "--porcelain")).toBe("");
    },
  );
}

it("commits the chosen occurrence when identical hunks are assigned in reverse order", async () => {
  const original = Array.from({ length: 35 }, (_, index) =>
    [1, 27].includes(index) ? "same old" : `context ${index + 1}`).join("\n") + "\n";
  const changed = original.split("same old").join("same new");
  const fixture = splitRepo(original);
  fixture.write(changed);
  const units = reviewedUnits(fixture.run("diff", "--", "selected.txt"));
  expect(units).toHaveLength(2);
  expect(units[0].signature).toBe(units[1].signature);
  await expect(applySplitPlan({ path: fixture.path, plan: orderedPlan([...units].reverse()), units, snapshot: fixture.snapshot(["selected.txt"]) }))
    .resolves.toEqual({ committed: 2, cancelled: false, remaining: 0 });
  const first = original.split("\n");
  first[27] = "same new";
  expect(fixture.run("show", "HEAD~1:selected.txt")).toBe(first.join("\n"));
  expect(fixture.run("show", "HEAD:selected.txt")).toBe(changed);
  expect(readFileSync(join(fixture.path, "selected.txt"), "utf8")).toBe(changed);
  expect(fixture.run("diff", "--cached")).toBe("");
});

it("retains later unit identity after an earlier commit shifts old hunk line numbers", async () => {
  const original = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join("\n") + "\n";
  const first = original.replace("line 2\n", "line 2\ninsert one\ninsert two\ninsert three\n");
  const changed = first.replace("line 32\n", "line 32 reviewed\n");
  const fixture = splitRepo(original);
  fixture.write(changed);
  const diff = fixture.run("diff", "--", "selected.txt");
  const units = reviewedUnits(diff);
  const initialStart = parseDiffWithHunks(diff).hunks[1].oldStart;
  let laterStart = initialStart;
  await applySplitPlan({ path: fixture.path, plan: orderedPlan(units), units, snapshot: fixture.snapshot(["selected.txt"]),
    onProgress: (progress) => {
      if (progress.groupIndex === 1 && progress.phase === "staging") {
        laterStart = parseDiffWithHunks(fixture.run("diff", "--", "selected.txt")).hunks[0].oldStart;
      }
    },
  });
  expect(laterStart).toBe(initialStart + 3);
  expect(fixture.run("show", "HEAD~1:selected.txt")).toBe(first);
  expect(fixture.run("show", "HEAD:selected.txt")).toBe(changed);
});

it.each(["extra", "missing"] as const)("rejects an %s remaining hunk before any reset or staging", async (variant) => {
  const original = Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join("\n") + "\n";
  const fixture = splitRepo(original);
  const reviewed = original.replace("line 2\n", "line 2 reviewed\n").replace("line 42\n", "line 42 reviewed\n");
  fixture.write(reviewed);
  const units = reviewedUnits(fixture.run("diff", "--", "selected.txt"));
  const expected = fixture.snapshot(["selected.txt"]);
  fixture.write(variant === "extra"
    ? reviewed.replace("line 22\n", "line 22 unexpected\n")
    : reviewed.replace("line 42 reviewed\n", "line 42\n"));
  const head = fixture.run("rev-parse", "HEAD");
  await expect(applySplitPlan({ path: fixture.path, plan: orderedPlan(units), units, snapshot: expected }))
    .rejects.toMatchObject({ preserveStaging: true });
  expect(fixture.commands).not.toContain("unstage_files");
  expect(fixture.commands).not.toContain("stage_hunk");
  expect(fixture.run("rev-parse", "HEAD")).toBe(head);
});

it("keeps the first successful commit when a later planned hunk disappears", async () => {
  const original = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join("\n") + "\n";
  const fixture = splitRepo(original);
  const first = original.replace("line 2\n", "line 2 reviewed\n");
  fixture.write(first.replace("line 32\n", "line 32 reviewed\n"));
  const units = reviewedUnits(fixture.run("diff", "--", "selected.txt"));
  await expect(applySplitPlan({ path: fixture.path, plan: orderedPlan(units), units, snapshot: fixture.snapshot(["selected.txt"]),
    onProgress: (progress) => {
      if (progress.groupIndex === 1 && progress.phase === "staging") fixture.write(first);
    },
  })).rejects.toMatchObject({ preserveStaging: true });
  expect(fixture.run("log", "--format=%s")).toBe("group 0\nbase\n");
  expect(fixture.run("show", "HEAD:selected.txt")).toBe(first);
  expect(fixture.commands.filter((command) => command === "unstage_files")).toHaveLength(0);
});

it("preserves a user's later staged selection on preflight failure", async () => {
  const fixture = splitRepo("old\n");
  fixture.write("reviewed\n");
  const units = reviewedUnits(fixture.run("diff", "--", "selected.txt"));
  const expected = fixture.snapshot(["selected.txt"]);
  writeFileSync(join(fixture.path, "other.txt"), "user staging\n");
  fixture.run("add", "--", "other.txt");
  const index = fixture.run("write-tree");
  await expect(applySplitPlan({ path: fixture.path, plan: orderedPlan(units), units, snapshot: expected }))
    .rejects.toMatchObject({ preserveStaging: true });
  expect(fixture.commands).toEqual(["repo_file_diff", "git_commit_split_group_checked"]);
  expect(fixture.run("write-tree")).toBe(index);
});

it("checks reviewed hunk context beyond the truncated AI preview", async () => {
  const lines = Array.from({ length: 8 }, (_, index) => `${index} ${"x".repeat(900)}`);
  const original = lines.join("\n") + "\n";
  const fixture = splitRepo(original);
  const changed = original.replace(lines[3], "reviewed");
  fixture.write(changed);
  const units = reviewedUnits(fixture.run("diff", "--", "selected.txt"));
  expect(units[0].hunkPayload.length).toBeGreaterThan(units[0].preview.length);
  const expected = fixture.snapshot(["selected.txt"]);
  const modifiedBase = original.replace(lines[6], `${6} ${"y".repeat(900)}`);
  fixture.write(modifiedBase);
  fixture.run("add", "--", "selected.txt");
  fixture.run("commit", "-qm", "context changed elsewhere");
  fixture.write(modifiedBase.replace(lines[3], "reviewed"));
  const fresh = reviewedUnits(fixture.run("diff", "--", "selected.txt"));
  expect(fresh[0].signature).toBe(units[0].signature);
  expect(fresh[0].preview).toBe(units[0].preview);
  await expect(applySplitPlan({ path: fixture.path, plan: orderedPlan(units), units, snapshot: expected }))
    .rejects.toMatchObject({ preserveStaging: true });
  expect(fixture.commands).not.toContain("unstage_files");
});

it("commits mixed selected hunks, a new file, and a deletion through only checked group RPCs", async () => {
  const original = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  const fixture = splitRepo(original);
  writeFileSync(join(fixture.path, "gone.txt"), "gone\n");
  fixture.run("add", "--", "gone.txt"); fixture.run("commit", "-qm", "tracked deletion source");
  const changed = original.replace("line 2\n", "first change\n").replace("line 25\n", "second change\n");
  fixture.write(changed); writeFileSync(join(fixture.path, "new.txt"), "new file\n"); rmSync(join(fixture.path, "gone.txt"));
  const units = [...reviewedUnits(fixture.run("diff", "--", "selected.txt")), ...buildSplitUnits([
    { file: "new.txt", diff: null, wholeFile: true, untracked: true, binary: false, additions: 1, deletions: 0 },
    { file: "gone.txt", diff: null, wholeFile: true, untracked: false, binary: false, additions: 0, deletions: 1 },
  ]).map((unit, index) => ({ ...unit, id: `whole${index}` }))];
  const plan: SplitPlan = { groups: [
    { id: "first", message: "first group", rationale: "", unitIds: [units[0].id, units[2].id] },
    { id: "second", message: "second group", rationale: "", unitIds: [units[1].id, units[3].id] },
  ] };
  await applySplitPlan({ path: fixture.path, units, plan, snapshot: fixture.snapshot(["selected.txt", "new.txt", "gone.txt"]) });
  expect(fixture.run("show", "HEAD~1:selected.txt")).toBe(original.replace("line 2\n", "first change\n"));
  expect(fixture.run("show", "--name-only", "--format=", "HEAD~1")).toContain("new.txt");
  expect(fixture.run("show", "--name-status", "--format=", "HEAD")).toContain("D\tgone.txt");
  expect(fixture.run("show", "HEAD:selected.txt")).toBe(changed);
  expect(fixture.run("status", "--porcelain")).toBe("");
  expect(fixture.transactions).toHaveLength(2);
  expect(fixture.transactions.every(transaction => (transaction.files as string[]).length === 3)).toBe(true);
  expect(fixture.commands.some(command => ["unstage_files", "stage_files", "stage_hunk", "commit_changes"].includes(command))).toBe(false);
});

it("rejects a raw binary whole-file edit immediately before the checked RPC", async () => {
  const fixture = splitRepo("base\n");
  writeFileSync(join(fixture.path, "blob.bin"), Buffer.from([0, 1, 2, 3]));
  const units = buildSplitUnits([{ file: "blob.bin", diff: null, wholeFile: true,
    untracked: true, binary: true, additions: 0, deletions: 0 }]);
  const snapshot = fixture.snapshot(["blob.bin"]); const head = fixture.run("rev-parse", "HEAD");
  fixture.beforeChecked(() => writeFileSync(join(fixture.path, "blob.bin"), Buffer.from([0, 4, 5, 6])));
  await expect(applySplitPlan({ path: fixture.path, units, plan: orderedPlan(units), snapshot }))
    .rejects.toMatchObject({ message: "__SPLIT_REVIEW_CHANGED__", preserveStaging: true });
  expect(fixture.transactions[0].expected).toEqual(snapshot);
  expect(fixture.run("rev-parse", "HEAD")).toBe(head);
  expect(fixture.run("diff", "--cached")).toBe("");
  expect(readFileSync(join(fixture.path, "blob.bin"))).toEqual(Buffer.from([0, 4, 5, 6]));
});

it("preserves newly staged user changes injected after the final frontend hunk read", async () => {
  const fixture = splitRepo("old\n"); fixture.write("reviewed\n");
  const units = reviewedUnits(fixture.run("diff", "--", "selected.txt"));
  const snapshot = fixture.snapshot(["selected.txt"]);
  fixture.beforeChecked(() => { writeFileSync(join(fixture.path, "other.txt"), "user selection\n"); fixture.run("add", "--", "other.txt"); });
  await expect(applySplitPlan({ path: fixture.path, units, plan: orderedPlan(units), snapshot }))
    .rejects.toMatchObject({ message: "__SPLIT_STAGING_CHANGED__", preserveStaging: true });
  expect(fixture.run("show", ":other.txt")).toBe("user selection\n");
  expect(fixture.run("show", ":selected.txt")).toBe("old\n");
  expect(fixture.transactions[0].expected).toEqual(snapshot);
});

it("does not accept a mixed collection when the working copy changes during its diff read", async () => {
  const fixture = splitRepo("old\n"); fixture.write("reviewed\n");
  fixture.beforeDiff(() => fixture.write("later edit\n"));
  await expect(collectSplitInputs(fixture.path)).rejects.toMatchObject({ message: "__SPLIT_REVIEW_CHANGED__", preserveStaging: true });
  expect(fixture.transactions).toHaveLength(0);
  expect(fixture.run("diff", "--cached")).toBe("");
  expect(readFileSync(join(fixture.path, "selected.txt"), "utf8")).toBe("later edit\n");
});

it.skipIf(process.platform === "win32")("keeps failed group staging and earlier commits until an explicit recollection retries", async () => {
  const fixture = splitRepo("old\n"); fixture.write("reviewed\n");
  writeFileSync(join(fixture.path, "new.txt"), "new file\n");
  const collected = await collectSplitInputs(fixture.path);
  const ordered = [...collected.units].sort((a, b) => Number(a.file === "new.txt") - Number(b.file === "new.txt"));
  const hook = join(fixture.path, ".git/hooks/pre-commit");
  await expect(applySplitPlan({ path: fixture.path, units: collected.units, plan: orderedPlan(ordered), snapshot: collected.snapshot,
    onProgress: progress => { if (progress.groupIndex === 1 && progress.phase === "committing") { writeFileSync(hook, "#!/bin/sh\nexit 1\n"); chmodSync(hook, 0o755); } },
  })).rejects.toMatchObject({ preserveStaging: true });
  expect(fixture.run("log", "--format=%s")).toBe("group 0\nbase\n");
  expect(fixture.run("show", ":new.txt")).toBe("new file\n");
  expect(fixture.commands.filter(command => command === "unstage_files")).toHaveLength(0);
  rmSync(hook);
  const retry = await collectSplitInputs(fixture.path);
  expect(retry.hadStaged).toBe(true); expect(retry.units.map(unit => unit.file)).toEqual(["new.txt"]);
  await applySplitPlan({ path: fixture.path, units: retry.units, plan: orderedPlan(retry.units), snapshot: retry.snapshot });
  expect(fixture.run("log", "--format=%s")).toBe("group 0\ngroup 0\nbase\n");
  expect(fixture.run("status", "--porcelain")).toBe("");
});
