import { beforeEach, describe, expect, it } from "vitest";

import { useRepoGroupsStore } from "./repo-groups-store";
import { dropDefaultCopies, useWorkspaceStore, workspaceRepo } from "./workspace-store";

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

describe("workspace-store rememberRepo", () => {
  beforeEach(seed);

  it("stores the repo on the workspace that contains it", () => {
    useWorkspaceStore.getState().rememberRepo("/three");
    const [a, b] = useWorkspaceStore.getState().workspaces;
    expect(a.lastRepoPath).toBeUndefined();
    expect(b.lastRepoPath).toBe("/three");
  });

  it("ignores repos that belong to no workspace", () => {
    const before = useWorkspaceStore.getState().workspaces;
    useWorkspaceStore.getState().rememberRepo("/elsewhere");
    expect(useWorkspaceStore.getState().workspaces).toBe(before);
  });
});

describe("workspaceRepo", () => {
  beforeEach(() => {
    seed();
    useRepoGroupsStore.setState({
      forest: [
        { type: "repo", path: "/three" },
        { type: "repo", path: "/two" },
        { type: "repo", path: "/one" },
      ],
    });
  });

  const open = ["/one", "/two", "/three"];

  it("returns the remembered repo while it is still open", () => {
    useWorkspaceStore.getState().rememberRepo("/one");
    expect(workspaceRepo("a", open)).toBe("/one");
  });

  it("falls back to the first tab when the remembered repo is closed", () => {
    useWorkspaceStore.getState().rememberRepo("/one");
    expect(workspaceRepo("a", ["/two", "/three"])).toBe("/two");
  });

  it("follows the tab order of the repo forest", () => {
    expect(workspaceRepo("a", open)).toBe("/two");
  });

  it("never picks a repo of another workspace", () => {
    expect(workspaceRepo("b", ["/one", "/two"])).toBeNull();
    expect(workspaceRepo("missing", open)).toBeNull();
  });
});

describe("workspace-store initDefaultWorkspace", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspaces: [
        { id: "default", name: "Personal", repoPaths: [] },
        { id: "work", name: "Work", repoPaths: ["/one"] },
      ],
      activeWorkspaceId: "work",
    });
  });

  it("adopts only open repos that belong to no workspace", () => {
    useWorkspaceStore.getState().initDefaultWorkspace(["/one", "/two"]);
    const [personal, work] = useWorkspaceStore.getState().workspaces;
    expect(personal.repoPaths).toEqual(["/two"]);
    expect(work.repoPaths).toEqual(["/one"]);
  });

  it("leaves an empty default workspace empty", () => {
    const before = useWorkspaceStore.getState().workspaces;
    useWorkspaceStore.getState().initDefaultWorkspace(["/one"]);
    expect(useWorkspaceStore.getState().workspaces).toBe(before);
  });
});

describe("workspace-store rememberRepo with a repo in two workspaces", () => {
  it("prefers the active workspace", () => {
    useWorkspaceStore.setState({
      workspaces: [
        { id: "a", name: "A", repoPaths: ["/one"] },
        { id: "b", name: "B", repoPaths: ["/one"] },
      ],
      activeWorkspaceId: "b",
    });
    useWorkspaceStore.getState().rememberRepo("/one");
    const [a, b] = useWorkspaceStore.getState().workspaces;
    expect(a.lastRepoPath).toBeUndefined();
    expect(b.lastRepoPath).toBe("/one");
  });
});

describe("initDefaultWorkspace without a default workspace", () => {
  it("adopts repos into the active workspace", () => {
    useWorkspaceStore.setState({
      workspaces: [{ id: "work", name: "Work", repoPaths: ["/one"] }],
      activeWorkspaceId: "work",
    });
    useWorkspaceStore.getState().initDefaultWorkspace(["/one", "/two"]);
    expect(useWorkspaceStore.getState().workspaces[0].repoPaths).toEqual(["/one", "/two"]);
  });
});

describe("dropDefaultCopies", () => {
  it("removes repos from the default workspace that another workspace holds", () => {
    const state = dropDefaultCopies({
      workspaces: [
        { id: "default", name: "Personal", repoPaths: ["/one", "/two", "/three"] },
        { id: "work", name: "Work", repoPaths: ["/one", "/three"] },
      ],
    });
    expect(state.workspaces.map((w) => w.repoPaths)).toEqual([["/two"], ["/one", "/three"]]);
  });
});
