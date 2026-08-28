import { beforeEach, describe, expect, it } from "vitest";

import { useWorkspaceStore } from "./workspace-store";

function seed() {
  useWorkspaceStore.setState({
    workspaces: [
      { id: "a", name: "A", repoPaths: ["/one", "/two"] },
      { id: "b", name: "B", repoPaths: ["/three"] },
    ],
    activeWorkspaceId: "a",
  });
}

describe("workspace-store moveReposToWorkspace", () => {
  beforeEach(seed);

  it("moves a single repo out of its workspace into the target", () => {
    useWorkspaceStore.getState().moveReposToWorkspace(["/one"], "b");
    const [a, b] = useWorkspaceStore.getState().workspaces;
    expect(a.repoPaths).toEqual(["/two"]);
    expect(b.repoPaths).toEqual(["/three", "/one"]);
  });

  it("moves every repo of a folder at once", () => {
    useWorkspaceStore.getState().moveReposToWorkspace(["/one", "/two"], "b");
    const [a, b] = useWorkspaceStore.getState().workspaces;
    expect(a.repoPaths).toEqual([]);
    expect(b.repoPaths).toEqual(["/three", "/one", "/two"]);
  });

  it("does not duplicate a repo that already lives in the target", () => {
    useWorkspaceStore.getState().moveReposToWorkspace(["/three"], "b");
    const b = useWorkspaceStore.getState().workspaces[1];
    expect(b.repoPaths).toEqual(["/three"]);
  });

  it("ignores empty selections and unknown workspaces", () => {
    const before = useWorkspaceStore.getState().workspaces;
    useWorkspaceStore.getState().moveReposToWorkspace([], "b");
    useWorkspaceStore.getState().moveReposToWorkspace(["/one"], "nope");
    expect(useWorkspaceStore.getState().workspaces).toBe(before);
  });
});
