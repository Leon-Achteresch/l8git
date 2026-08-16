import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import {
  buildSplitUnits,
  matchUnitsToHunks,
  selectionKeysForHunks,
} from "@/lib/commit-split";
import { buildPatchesForSelection, parseDiffWithHunks } from "@/lib/unified-diff";

const repo = mkdtempSync(join(tmpdir(), "l8git-split-"));
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });

afterAll(() => rmSync(repo, { recursive: true, force: true }));

function applyCached(patch: string) {
  execFileSync("git", ["-C", repo, "apply", "--cached", "--whitespace=nowarn"], {
    input: patch,
    encoding: "utf8",
  });
}

it("stages planned hunks group by group against a real repo", () => {
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t.dev");
  git("config", "user.name", "T");
  git("config", "commit.gpgsign", "false");

  const original = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  writeFileSync(join(repo, "a.txt"), original);
  writeFileSync(join(repo, "c.txt"), "gone\n");
  git("add", ".");
  git("commit", "-qm", "init");

  const modified = original
    .replace("line 2\n", "line 2 changed\n")
    .replace("line 25\n", "line 25 changed\n");
  writeFileSync(join(repo, "a.txt"), modified);
  writeFileSync(join(repo, "b.txt"), "brand new\n");
  rmSync(join(repo, "c.txt"));

  const diff = git("diff", "--no-color", "--", "a.txt");
  const units = buildSplitUnits([
    {
      file: "a.txt",
      diff,
      wholeFile: false,
      untracked: false,
      binary: false,
      additions: 2,
      deletions: 2,
    },
    {
      file: "b.txt",
      diff: null,
      wholeFile: true,
      untracked: true,
      binary: false,
      additions: 1,
      deletions: 0,
    },
    {
      file: "c.txt",
      diff: null,
      wholeFile: true,
      untracked: false,
      binary: false,
      additions: 0,
      deletions: 1,
    },
  ]);
  expect(units.map((u) => `${u.file}:${u.kind}`)).toEqual([
    "a.txt:hunk",
    "a.txt:hunk",
    "b.txt:file",
    "c.txt:file",
  ]);

  const groups = [
    { message: "feat: first", unitIds: [units[0].id, units[2].id] },
    { message: "fix: second", unitIds: [units[1].id, units[3].id] },
  ];

  for (const group of groups) {
    git("reset", "-q", "HEAD", "--", ".");
    const members = units.filter((u) => group.unitIds.includes(u.id));
    for (const file of new Set(members.map((u) => u.file))) {
      const fileUnits = members.filter((u) => u.file === file);
      if (fileUnits.some((u) => u.kind === "file")) {
        git("add", "--", file);
        continue;
      }
      const fresh = parseDiffWithHunks(git("diff", "--no-color", "--", file));
      const { indices, missing } = matchUnitsToHunks(
        fresh,
        fileUnits.map((u) => u.signature),
      );
      expect(missing).toEqual([]);
      for (const patch of buildPatchesForSelection(fresh, selectionKeysForHunks(fresh, indices))) {
        applyCached(patch);
      }
    }
    git("commit", "-qm", group.message);
  }

  const log = git("log", "--format=%s").trim().split("\n");
  expect(log).toEqual(["fix: second", "feat: first", "init"]);
  expect(git("status", "--porcelain").trim()).toBe("");
  expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe(modified);

  const first = git("show", "--stat", "--format=", "HEAD~1");
  expect(first).toContain("a.txt");
  expect(first).toContain("b.txt");
  expect(first).not.toContain("c.txt");

  const second = git("show", "--name-status", "--format=", "HEAD");
  expect(second).toContain("D\tc.txt");
  expect(second).toContain("M\ta.txt");
});
