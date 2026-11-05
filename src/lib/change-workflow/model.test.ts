import { describe, expect, it } from "vitest";

import {
  buildChangeMap,
  chapterState,
  evidenceState,
  moveChapter,
  planInitiative,
  transitionInitiative,
  workflowScope,
  type ChangeInitiative,
  type ReviewChapter,
} from "./model";

describe("architecture map data", () => {
  it("retains stable path identities and aggregates real overlays on directories", () => {
    const files = [
      { path: "src/api/client.ts", pullRequests: ["12"], sessions: ["agent-a"] },
      { path: "src/ui/view.tsx", pullRequests: ["14", "12"], sessions: ["agent-b"] },
    ];
    const map = buildChangeMap(files, [
      { from: files[1].path, to: files[0].path, source: "import" },
      { from: files[1].path, to: "missing.ts", source: "import" },
    ]);
    expect(map.nodes.find(node => node.id === "src")).toMatchObject({ pullRequests: ["12", "14"], sessions: ["agent-a", "agent-b"], size: null });
    expect(map.dependencies).toHaveLength(1);
    expect(buildChangeMap(files.slice(1)).nodes.find(node => node.id === files[1].path)?.id).toBe(files[1].path);
    expect(buildChangeMap([...files].reverse())).toEqual(buildChangeMap(files));
  });

  it("never invents dependency relationships from co-occurring files", () => {
    expect(buildChangeMap([{ path: "a.ts" }, { path: "b.ts" }]).dependencies).toEqual([]);
    expect(buildChangeMap([{ path: "a.ts", size: NaN }]).nodes[0].size).toBeNull();
  });

  it("rejects ambiguous map paths and file-directory collisions", () => {
    for (const path of ["../a", "/root/a", "a//b", "a/./b", "a\0b"]) {
      expect(() => buildChangeMap([{ path }])).toThrow();
    }
    expect(() => buildChangeMap([{ path: "src" }, { path: "src/a.ts" }])).toThrow();
    expect(() => buildChangeMap([{ path: "a.ts" }, { path: "a.ts" }])).toThrow();
  });
});

const chapter: ReviewChapter = {
  id: "schema",
  title: "Schema",
  explanation: "Start with the schema change.",
  anchors: [{ path: "schema.ts", side: "head", startLine: 10, endLine: 20, baseSha: "base", headSha: "head", contentFingerprint: "original-content" }],
};

describe("revision-aware review narratives", () => {
  it("distinguishes unloaded, missing, changed and unchanged anchor content", () => {
    expect(chapterState(chapter, null)).toBe("unknown");
    expect(chapterState(chapter, [])).toBe("missing");
    expect(chapterState(chapter, [{ ...chapter.anchors[0], contentFingerprint: null }])).toBe("unknown");
    expect(chapterState(chapter, [{ ...chapter.anchors[0], contentFingerprint: "new-content" }])).toBe("changed");
    expect(chapterState(chapter, chapter.anchors)).toBe("current");
    expect(chapterState(chapter, [{ ...chapter.anchors[0], startLine: 11 }])).toBe("missing");
  });

  it("moves a chapter without modifying its original narrative or anchor identity", () => {
    const narrative = { id: "review", scope: "repo", pullNumber: 1, title: "Walkthrough", chapters: [chapter, { ...chapter, id: "tests" }] };
    expect(moveChapter(narrative, "schema", 1).chapters.map(item => item.id)).toEqual(["tests", "schema"]);
    expect(narrative.chapters[0].id).toBe("schema");
    expect(() => moveChapter(narrative, "missing", 0)).toThrow();
  });
});

describe("agent check evidence", () => {
  const snapshot = { baseSha: "base", headSha: "head", worktreeFingerprint: "content-a" };

  it("invalidates old evidence even when only uncommitted content changed", () => {
    expect(evidenceState({ snapshot }, snapshot)).toBe("current");
    expect(evidenceState({ snapshot }, { ...snapshot, worktreeFingerprint: "content-b" })).toBe("stale");
    expect(evidenceState({ snapshot }, { ...snapshot, headSha: "new-head" })).toBe("stale");
    expect(evidenceState({ snapshot }, { ...snapshot, baseSha: "new-base" })).toBe("stale");
    expect(evidenceState({ snapshot }, null)).toBe("unknown");
    expect(evidenceState({ snapshot }, { ...snapshot, worktreeFingerprint: "" })).toBe("unknown");
  });
});

function initiative(): ChangeInitiative {
  return { id: "feature", scope: "organization", name: "API change", steps: [
    { id: "ui", repository: "org/ui", branch: "feature", headSha: "u", dependsOn: ["api"], status: "pending" },
    { id: "api", repository: "org/api", branch: "feature", headSha: "a", dependsOn: [], status: "pending" },
  ] };
}

describe("multi-repository coordination", () => {
  it("orders prerequisites, blocks early starts, and resumes after failures", () => {
    const initial = initiative();
    expect(planInitiative(initial)).toEqual({ order: ["api", "ui"], ready: ["api"], blocked: ["ui"] });
    expect(() => transitionInitiative(initial, "ui", "running")).toThrow();
    const failed = transitionInitiative(transitionInitiative(initial, "api", "running"), "api", "failed", "CI failed");
    expect(failed.steps[1].error).toBe("CI failed");
    const retried = transitionInitiative(failed, "api", "running");
    expect(retried.steps[1].error).toBeUndefined();
    const completed = transitionInitiative(retried, "api", "done");
    expect(planInitiative(completed).ready).toEqual(["ui"]);
    const activeUi = transitionInitiative(completed, "ui", "running");
    expect(() => transitionInitiative(activeUi, "api", "pending")).toThrow();
    expect(initial.steps[1].status).toBe("pending");
  });

  it("rejects cycles, missing prerequisites and duplicate IDs before executing anything", () => {
    const cycle = initiative();
    cycle.steps[1].dependsOn = ["ui"];
    expect(() => planInitiative(cycle)).toThrow(/cycle/);
    const missing = initiative();
    missing.steps[0].dependsOn = ["unknown"];
    expect(() => planInitiative(missing)).toThrow(/Unknown/);
    const duplicate = initiative();
    duplicate.steps.push(duplicate.steps[0]);
    expect(() => planInitiative(duplicate)).toThrow(/Duplicate/);
    expect(() => transitionInitiative(initiative(), "api", "done")).toThrow(/running/);
  });

  it("scopes persisted artifacts without delimiter collisions or cross-account mixing", () => {
    expect(workflowScope("github", "GITHUB.COM", "alice", "org/repo")).toBe(workflowScope("github", "github.com", "alice", "org/repo"));
    expect(workflowScope("github", "github.com", "alice", "org/repo")).not.toBe(workflowScope("github", "github.com", "bob", "org/repo"));
    expect(workflowScope("a:b", "c", "d", "e")).not.toBe(workflowScope("a", "b:c", "d", "e"));
  });
});
