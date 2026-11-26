import assert from "node:assert/strict";
import { groupBranchesByKind } from "../src/lib/branch-groups";
import { buildGraph, computeReachableHashes, historyGraph } from "../src/lib/graph";
import type { Branch, Commit, StatusEntry } from "../src/lib/repo-store";
import { flattenParsedDiff, parseDiffWithHunks } from "../src/lib/unified-diff";
import { sameStatusEntries } from "../src/lib/status-entries";
import { diffWords } from "../src/lib/word-diff";

const results: Record<string, { medianMs: number; p95Ms: number; budgetMs: number }> = {};
const sampleCount = 15;

function measure(name: string, budgetMs: number, run: () => number, expected: number) {
  assert.equal(run(), expected, name);
  const samples = Array.from({ length: sampleCount }, () => {
    const start = performance.now();
    const count = run();
    const elapsed = performance.now() - start;
    assert.equal(count, expected, name);
    return elapsed;
  }).sort((a, b) => a - b);
  const medianMs = samples[Math.floor(sampleCount / 2)];
  results[name] = {
    medianMs: +medianMs.toFixed(3),
    p95Ms: +samples[Math.ceil(sampleCount * 0.95) - 1].toFixed(3),
    budgetMs,
  };
  if (medianMs > budgetMs) {
    console.error(`${name}: median ${medianMs.toFixed(2)} ms exceeds ${budgetMs.toFixed(2)} ms`);
    process.exitCode = 1;
  }
}

for (const size of [100, 1000, 5000]) {
  for (const layout of ["flat", "grouped", "remote"]) {
    const branches: Branch[] = Array.from({ length: size }, (_, i) => {
      const id = (i * 7919) % size;
      const prefix = layout === "flat" ? "" : layout === "remote" ? "origin/fix/" : "feature/";
      return { name: prefix + id, is_current: i === 0, is_remote: layout === "remote", tip: String(i) };
    });
    measure(`branches/${layout}/${size}`, Math.max(5, size / 180), () => {
      const { flat, groups } = groupBranchesByKind(branches);
      return groups.reduce((count, group) => count + group.branches.length, flat.length);
    }, size);
  }
}

for (const size of [100, 1000, 10000]) {
  for (const merges of [false, true]) {
    const commits: Commit[] = Array.from({ length: size }, (_, i) => {
      const parents = i + 1 < size ? [String(i + 1)] : [];
      if (merges && i % 8 === 0 && i + 5 < size) parents.push(String(i + 5));
      return {
        hash: String(i), short_hash: String(i), parents, author: "Fixture",
        email: "fixture@example.org", date: "2026-01-01", subject: "Update", body: "", tags: [],
      };
    });
    const shape = merges ? "merges" : "linear";
    measure(`history/${shape}/${size}`, 100, () => buildGraph(commits).rows.length, size);
    const branches = [
      { name: "main", tip: "0", is_current: true, is_remote: false },
      { name: "develop", tip: String(size - 1), is_current: false, is_remote: false },
    ];
    measure(`history/branch-tips/${shape}/${size}`, 100, () => buildGraph(commits, branches).rows.length, size);
    measure(`history/revisit/${shape}/${size}`, 1, () => historyGraph(commits, branches).rows.length, size);
    measure(`ancestors/${shape}/${size}`, 50, () => computeReachableHashes(commits, ["0"]).size, size);
  }
}

for (const hunks of [10, 100, 1000]) {
  const patch = Array.from({ length: hunks }, (_, i) =>
    `@@ -${i * 10 + 1},10 +${i * 10 + 1},10 @@\n${"-old\n".repeat(10)}${"+new\n".repeat(10)}`
  ).join("");
  measure(`diff/parse-and-flatten/${hunks}`, 100,
    () => flattenParsedDiff(parseDiffWithHunks(patch)).length, hunks * 21);
}

for (const words of [16, 64, 160]) {
  for (const position of [0, Math.floor(words / 2), words - 1]) {
    const pairs = Array.from({ length: 64 }, (_, line) => {
      const tokens = Array.from({ length: words }, (_, i) => `item${line}_${i}`);
      const before = tokens.join(" ");
      tokens[position] = "updated";
      return [before, tokens.join(" ")] as const;
    });
    const budgetMs = position === words - 1 ? 10 : 100;
    measure(`word-diff/${words}/edit-at-${position}`, budgetMs, () => {
      let highlighted = 0;
      for (const [before, after] of pairs) {
        if (diffWords(before, after)?.add.some(s => s.changed && s.text === "updated")) highlighted++;
      }
      return highlighted;
    }, pairs.length);
  }
}

// Native IPC allocates fresh rows even when the worktree is unchanged.
for (const size of [1000, 10000, 50000]) {
  const entries: StatusEntry[] = Array.from({ length: size }, (_, i) => ({
    path: `packages/module-${i % 16}/src/file-${i}.ts`, index_status: " ", worktree_status: "M",
    staged: false, unstaged: true, untracked: false, binary: false, embedded_repo: false,
    additions_staged: 0, deletions_staged: 0, additions_unstaged: 5, deletions_unstaged: 1,
  }));
  for (const change of ["none", "first", "last"]) {
    const incoming = entries.map(entry => ({ ...entry }));
    if (change !== "none") incoming[change === "first" ? 0 : size - 1].deletions_unstaged++;
    measure(`refresh/${size}/${change}`, 20, () => Number(sameStatusEntries(entries, incoming)), Number(change === "none"));
  }
}

console.log(JSON.stringify({ runtime: process.versions.bun, arch: process.arch, sampleCount, results }, null, 2));
