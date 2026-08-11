import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import {
  useAgentWorktreeStore,
  worktreeDisplayName,
  worktreeSlug,
  worktreeTargetPath,
} from "@/lib/agents/agent-worktrees";

describe("worktreeSlug", () => {
  it("slugifies names", () => {
    expect(worktreeSlug("Fix Login Bug!")).toBe("fix-login-bug");
    expect(worktreeSlug("  Ärger mit   Umlauten  ")).toBe("rger-mit-umlauten");
  });

  it("caps length at 40 characters", () => {
    expect(worktreeSlug("x".repeat(80))).toHaveLength(40);
  });

  it("falls back to a time-based name", () => {
    expect(worktreeSlug(undefined, () => 1234567)).toBe(`agent-${(1234567).toString(36)}`);
    expect(worktreeSlug("!!!", () => 1234567)).toBe(`agent-${(1234567).toString(36)}`);
  });
});

describe("worktreeTargetPath", () => {
  it("places worktrees next to the repository", () => {
    expect(worktreeTargetPath("/Users/dev/app", "fix-bug")).toBe(
      "/Users/dev/app.worktrees/fix-bug",
    );
    expect(worktreeTargetPath("/Users/dev/app///", "fix-bug")).toBe(
      "/Users/dev/app.worktrees/fix-bug",
    );
  });

  it("uses backslashes for windows paths", () => {
    expect(worktreeTargetPath("C:\\dev\\app", "fix-bug")).toBe(
      "C:\\dev\\app.worktrees\\fix-bug",
    );
  });
});

describe("worktreeDisplayName", () => {
  it("returns the last path segment", () => {
    expect(worktreeDisplayName("/a/b/c")).toBe("c");
    expect(worktreeDisplayName("C:\\a\\b")).toBe("b");
  });
});

describe("useAgentWorktreeStore", () => {
  beforeEach(() => {
    invoke.mockReset();
    useAgentWorktreeStore.setState({ worktrees: {} });
  });

  it("creates a worktree via git and records it", async () => {
    invoke.mockResolvedValue("");
    const entry = await useAgentWorktreeStore.getState().createWorktree("/repo", "My Feature");
    expect(invoke).toHaveBeenCalledWith("git_worktree_add", {
      path: "/repo",
      worktreePath: "/repo.worktrees/my-feature",
      branch: null,
      newBranch: "agents/my-feature",
    });
    expect(entry.branch).toBe("agents/my-feature");
    expect(useAgentWorktreeStore.getState().worktrees[entry.path]).toEqual(entry);
  });

  it("rejects duplicates and empty base paths", async () => {
    invoke.mockResolvedValue("");
    await useAgentWorktreeStore.getState().createWorktree("/repo", "dup");
    await expect(
      useAgentWorktreeStore.getState().createWorktree("/repo", "dup"),
    ).rejects.toThrow(/existiert bereits/u);
    await expect(useAgentWorktreeStore.getState().createWorktree("  ")).rejects.toThrow();
  });

  it("does not record a worktree when git fails", async () => {
    invoke.mockRejectedValue(new Error("fatal: branch exists"));
    await expect(
      useAgentWorktreeStore.getState().createWorktree("/repo", "boom"),
    ).rejects.toThrow("fatal: branch exists");
    expect(useAgentWorktreeStore.getState().worktrees).toEqual({});
  });

  it("removes a worktree via git and forgets it", async () => {
    invoke.mockResolvedValue("");
    const entry = await useAgentWorktreeStore.getState().createWorktree("/repo", "gone");
    invoke.mockClear();
    await useAgentWorktreeStore.getState().removeWorktree(entry.path, { force: true });
    expect(invoke).toHaveBeenCalledWith("git_worktree_remove", {
      path: "/repo",
      worktreePath: entry.path,
      force: true,
    });
    expect(useAgentWorktreeStore.getState().worktrees).toEqual({});
  });

  it("lands a clean worktree: merge, remove, delete branch, forget", async () => {
    invoke.mockResolvedValue("");
    const entry = await useAgentWorktreeStore.getState().createWorktree("/repo", "ship");
    invoke.mockReset();
    invoke.mockImplementation((command: unknown) =>
      command === "repo_status" ? Promise.resolve([]) : Promise.resolve("Merge made"),
    );
    const output = await useAgentWorktreeStore.getState().landWorktree(entry.path);
    expect(output).toBe("Merge made");
    expect(invoke.mock.calls.map((call) => call[0])).toEqual([
      "repo_status",
      "git_merge",
      "git_worktree_remove",
      "delete_branch",
    ]);
    expect(invoke).toHaveBeenCalledWith("git_merge", {
      path: "/repo",
      branch: "agents/ship",
      strategy: null,
      message: null,
    });
    expect(useAgentWorktreeStore.getState().worktrees).toEqual({});
  });

  it("refuses to land a dirty worktree", async () => {
    invoke.mockResolvedValue("");
    const entry = await useAgentWorktreeStore.getState().createWorktree("/repo", "dirty-land");
    invoke.mockReset();
    invoke.mockImplementation((command: unknown) =>
      command === "repo_status" ? Promise.resolve([{ path: "a.ts" }]) : Promise.resolve(""),
    );
    await expect(useAgentWorktreeStore.getState().landWorktree(entry.path)).rejects.toThrow(
      /nicht committete/u,
    );
    expect(invoke.mock.calls.map((call) => call[0])).toEqual(["repo_status"]);
    expect(useAgentWorktreeStore.getState().worktrees[entry.path]).toBeDefined();
  });

  it("translates the dirty-base marker and keeps the entry on merge failure", async () => {
    invoke.mockResolvedValue("");
    const entry = await useAgentWorktreeStore.getState().createWorktree("/repo", "blocked");
    invoke.mockReset();
    invoke.mockImplementation((command: unknown) => {
      if (command === "repo_status") return Promise.resolve([]);
      return Promise.reject(new Error("__LOCAL_CHANGES_BLOCK__|a.ts"));
    });
    await expect(useAgentWorktreeStore.getState().landWorktree(entry.path)).rejects.toThrow(
      /Basis-Repository hat lokale Änderungen/u,
    );
    expect(useAgentWorktreeStore.getState().worktrees[entry.path]).toBeDefined();
  });

  it("still lands when only the branch cleanup fails", async () => {
    invoke.mockResolvedValue("");
    const entry = await useAgentWorktreeStore.getState().createWorktree("/repo", "half");
    invoke.mockReset();
    invoke.mockImplementation((command: unknown) => {
      if (command === "repo_status") return Promise.resolve([]);
      if (command === "delete_branch") return Promise.reject(new Error("in use"));
      return Promise.resolve("Merge made");
    });
    await expect(useAgentWorktreeStore.getState().landWorktree(entry.path)).resolves.toBe(
      "Merge made",
    );
    expect(useAgentWorktreeStore.getState().worktrees).toEqual({});
  });

  it("keeps the entry when forced removal fails", async () => {
    invoke.mockResolvedValue("");
    const entry = await useAgentWorktreeStore.getState().createWorktree("/repo", "dirty");
    invoke.mockRejectedValue(new Error("contains modified files"));
    await expect(
      useAgentWorktreeStore.getState().removeWorktree(entry.path),
    ).rejects.toThrow("contains modified files");
    expect(useAgentWorktreeStore.getState().worktrees[entry.path]).toBeDefined();
  });
});
