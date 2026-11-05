import { beforeEach, describe, expect, it, vi } from "vitest";

const agent = vi.hoisted(() => ({
  provider: "codex",
  state: { activeThreadByPath: {} as Record<string, string | null>, threadsByPath: {} as Record<string, { id: string }[]>, openThread: vi.fn(async () => undefined) },
}));
vi.mock("@/lib/agents/active-chat-store", () => ({ useAgentChatStore: { getState: () => agent.state } }));
vi.mock("@/lib/agents/provider-store", () => ({ activeAgentProvider: () => agent.provider }));

import { branchContextKey, useGithubWorkspace } from "@/lib/github-expansion/store";
import { saveRepoViewState } from "@/lib/repo-view-state";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";

import { branchSwitches, handleBranchSwitch, parseTaskKey, rememberBranchFile, taskKeyOf, useBranchRestore } from "./branch-context";

const ctx = (path: string, branch: string) => useGithubWorkspace.getState().branchContexts[branchContextKey(path, branch)];
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("branch switch detection (ID 68)", () => {
  it("reports only in-place changes; new repos, removals and empty loading values are not switches", () => {
    let r = branchSwitches(new Map(), { "/a": { branch: "main" } });
    expect(r.switches).toEqual([]);
    r = branchSwitches(r.next, { "/a": { branch: "" }, "/b": { branch: "dev" } });
    expect(r.switches).toEqual([]);
    expect(r.next.get("/a")).toBe("main");
    r = branchSwitches(r.next, { "/a": { branch: "feat" }, "/b": { branch: "dev" } });
    expect(r.switches).toEqual([{ path: "/a", from: "main", to: "feat" }]);
    expect(branchSwitches(r.next, { "/b": { branch: "x" } }).next.has("/a")).toBe(false);
  });
  it("task keys are provider-scoped and malformed keys are ignored", () => {
    expect(parseTaskKey(taskKeyOf("claude", "t1"))).toEqual({ provider: "claude", threadId: "t1" });
    expect(parseTaskKey("{bad")).toBeNull();
    expect(parseTaskKey(undefined)).toBeNull();
  });
});

describe("save outgoing / restore incoming", () => {
  beforeEach(() => {
    useGithubWorkspace.setState({ branchContexts: {} });
    useBranchRestore.setState({ request: null });
    useRepoStore.setState({ activePath: "/repo" });
    useUiStore.setState({ sidebarTab: "commit" });
    agent.state.activeThreadByPath = {};
    agent.state.threadsByPath = {};
    agent.state.openThread.mockClear();
  });

  it("round-trips panel, user-selected file, scroll and task between branches", async () => {
    rememberBranchFile("/repo", "main", "unstaged:a.ts");
    saveRepoViewState("/repo", { filesScroll: { context: "c", offset: 240 } });
    agent.state.activeThreadByPath["/repo"] = "thread-main";
    agent.state.threadsByPath["/repo"] = [{ id: "thread-main" }, { id: "thread-feat" }];
    useUiStore.setState({ sidebarTab: "pr" });
    handleBranchSwitch({ path: "/repo", from: "main", to: "feat" });
    await flush();
    expect(ctx("/repo", "main")).toEqual({ panel: "pr", file: "unstaged:a.ts", scrollTop: 240, taskKey: taskKeyOf("codex", "thread-main") });
    expect(useBranchRestore.getState().request).toBeNull(); // nothing saved for feat yet: nothing invented

    useUiStore.setState({ sidebarTab: "history" });
    agent.state.activeThreadByPath["/repo"] = "thread-feat";
    handleBranchSwitch({ path: "/repo", from: "feat", to: "main" });
    await flush();
    expect(useUiStore.getState().sidebarTab).toBe("pr");
    expect(useBranchRestore.getState().request).toMatchObject({ path: "/repo", branch: "main", file: "unstaged:a.ts", scrollTop: 240 });
    expect(agent.state.openThread).toHaveBeenCalledWith("/repo", "thread-main");
  });

  it("does not leak between repositories and never switches the panel of an inactive repo", async () => {
    useGithubWorkspace.getState().saveBranchContext("/other", "main", { panel: "ci", file: "x" });
    useGithubWorkspace.getState().saveBranchContext("/repo", "main", { panel: "stash" });
    handleBranchSwitch({ path: "/other", from: "dev", to: "main" });
    await flush();
    expect(useUiStore.getState().sidebarTab).toBe("commit");
    expect(useBranchRestore.getState().request).toMatchObject({ path: "/other", file: "x" });
    expect(ctx("/repo", "dev")).toBeUndefined();
  });

  it("skips stale task restores, other providers and threads that no longer exist", async () => {
    useGithubWorkspace.getState().saveBranchContext("/repo", "a", { panel: "commit", taskKey: taskKeyOf("claude", "t") });
    agent.state.threadsByPath["/repo"] = [{ id: "t" }];
    handleBranchSwitch({ path: "/repo", from: "b", to: "a" });
    await flush();
    expect(agent.state.openThread).not.toHaveBeenCalled(); // provider mismatch

    useGithubWorkspace.getState().saveBranchContext("/repo", "a", { panel: "commit", taskKey: taskKeyOf("codex", "gone") });
    handleBranchSwitch({ path: "/repo", from: "b", to: "a" });
    await flush();
    expect(agent.state.openThread).not.toHaveBeenCalled(); // deleted thread

    useGithubWorkspace.getState().saveBranchContext("/repo", "a", { panel: "commit", taskKey: taskKeyOf("codex", "t") });
    handleBranchSwitch({ path: "/repo", from: "b", to: "a" });
    handleBranchSwitch({ path: "/repo", from: "a", to: "c" }); // newer switch supersedes the pending restore
    await flush();
    expect(agent.state.openThread).not.toHaveBeenCalled();
  });
});
