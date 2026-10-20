import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: { path: string }) =>
    cmd === "open_repo" ? { path: args.path, commits: [] } : null,
  ),
}));

import { useRepoGroupsStore } from "./repo-groups-store";
import { useRepoStore } from "./repo-store";
import { useWorkspaceStore } from "./workspace-store";
import { deleteWorkspace, switchWorkspace } from "./workspace-switch";

const reload = vi.fn(async () => {});

beforeEach(() => {
  reload.mockClear();
  useWorkspaceStore.setState({
    workspaces: [
      { id: "a", name: "A", repoPaths: ["/one", "/two"] },
      { id: "b", name: "B", repoPaths: ["/three", "/four"] },
      { id: "c", name: "C", repoPaths: [] },
    ],
    activeWorkspaceId: "a",
  });
  useRepoGroupsStore.setState({
    forest: ["/one", "/two", "/three", "/four"].map((path) => ({
      type: "repo" as const,
      path,
    })),
  });
  useRepoStore.setState({
    paths: ["/one", "/two", "/three", "/four"],
    activePath: "/two",
    repos: {},
    reload,
    reloadStashes: async () => {},
  });
});

const activePath = () => useRepoStore.getState().activePath;

describe("switchWorkspace", () => {
  it("opens the first repo of a workspace visited for the first time", () => {
    switchWorkspace("b");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("b");
    expect(activePath()).toBe("/three");
    expect(reload).toHaveBeenCalledWith("/three");
  });

  it("brings back the repo that was open when the workspace was left", () => {
    switchWorkspace("b");
    useRepoStore.getState().setActive("/four");
    switchWorkspace("a");
    expect(activePath()).toBe("/two");
    switchWorkspace("b");
    expect(activePath()).toBe("/four");
  });

  it("shows no repo for a workspace without open repos", () => {
    switchWorkspace("c");
    expect(activePath()).toBeNull();
    switchWorkspace("a");
    expect(activePath()).toBe("/two");
  });

  it("does nothing when the workspace is already active", () => {
    switchWorkspace("a");
    expect(activePath()).toBe("/two");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("deleteWorkspace", () => {
  it("moves its repos to the workspace that takes over and keeps the open one", () => {
    deleteWorkspace("a");
    const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState();
    expect(activeWorkspaceId).toBe("b");
    expect(workspaces[0].repoPaths).toEqual(["/three", "/four", "/one", "/two"]);
    expect(activePath()).toBe("/two");
  });

  it("keeps the open repo when another workspace is deleted", () => {
    deleteWorkspace("b");
    expect(useWorkspaceStore.getState().workspaces[0].repoPaths).toEqual(["/one", "/two", "/three", "/four"]);
    expect(activePath()).toBe("/two");
    expect(reload).not.toHaveBeenCalled();
  });

  it("opens a repo when the deleted workspace was empty", () => {
    switchWorkspace("c");
    deleteWorkspace("c");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("a");
    expect(activePath()).toBe("/two");
  });
});

describe("activating a repo of another workspace", () => {
  it("switches to its workspace and remembers the one left", () => {
    useRepoStore.getState().setActive("/four");
    const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState();
    expect(activeWorkspaceId).toBe("b");
    expect(workspaces[0].lastRepoPath).toBe("/two");
    expect(activePath()).toBe("/four");
  });
});

describe("closing the active repo", () => {
  it("stays inside the active workspace and loads the next repo", () => {
    switchWorkspace("b");
    reload.mockClear();
    useRepoStore.getState().removeRepo("/three");
    expect(activePath()).toBe("/four");
    expect(reload).toHaveBeenCalledWith("/four");
  });

  it("shows no repo instead of one from another workspace", () => {
    useRepoStore.setState({ paths: ["/one", "/three"], activePath: "/one" });
    useRepoStore.getState().removeRepo("/one");
    expect(activePath()).toBeNull();
  });
});

describe("opening a repo that is already open", () => {
  it("switches to the workspace that holds it", async () => {
    switchWorkspace("c");
    await useRepoStore.getState().addRepo("/three");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("b");
    expect(activePath()).toBe("/three");
  });

  it("adopts a repo that belongs to no workspace", async () => {
    useRepoStore.setState({ paths: ["/one", "/two", "/three", "/four", "/five"] });
    await useRepoStore.getState().addRepo("/five");
    expect(useWorkspaceStore.getState().workspaces[0].repoPaths).toContain("/five");
    expect(activePath()).toBe("/five");
  });
});

describe("a repo listed in two workspaces", () => {
  it("does not leave the active workspace when its tab is clicked", () => {
    useWorkspaceStore.setState({
      workspaces: [
        { id: "a", name: "A", repoPaths: ["/one", "/two", "/three"] },
        { id: "b", name: "B", repoPaths: ["/three", "/four"] },
      ],
      activeWorkspaceId: "b",
    });
    useRepoStore.getState().setActive("/three");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe("b");
  });
});
