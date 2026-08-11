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
