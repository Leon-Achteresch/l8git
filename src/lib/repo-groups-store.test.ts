import { describe, expect, it } from "vitest";
import {
  flattenRepoPaths,
  useRepoGroupsStore,
  type ForestNode,
} from "./repo-groups-store";

function forestWithGroups(): ForestNode[] {
  return [
    {
      type: "group",
      id: "a",
      name: "A",
      hue: 10,
      collapsed: false,
      children: [{ type: "repo", path: "/a/one" }],
    },
    {
      type: "group",
      id: "b",
      name: "B",
      hue: 20,
      collapsed: false,
      children: [
        { type: "repo", path: "/b/two" },
        {
          type: "group",
          id: "b1",
          name: "B1",
          hue: 30,
          collapsed: true,
          children: [{ type: "repo", path: "/b/nested" }],
        },
      ],
    },
    { type: "repo", path: "/loose" },
  ];
}

describe("repo-groups collapse + flatten", () => {
  it("syncCollapseToActive expands ancestors and collapses siblings", () => {
    useRepoGroupsStore.setState({ forest: forestWithGroups() });
    useRepoGroupsStore.getState().syncCollapseToActive("/b/nested");
    const forest = useRepoGroupsStore.getState().forest;
    const a = forest[0];
    const b = forest[1];
    expect(a.type).toBe("group");
    expect(b.type).toBe("group");
    if (a.type !== "group" || b.type !== "group") return;
    expect(a.collapsed).toBe(true);
    expect(b.collapsed).toBe(false);
    const b1 = b.children[1];
    expect(b1.type).toBe("group");
    if (b1.type !== "group") return;
    expect(b1.collapsed).toBe(false);
  });

  it("flattenRepoPaths walks nested groups", () => {
    expect(flattenRepoPaths(forestWithGroups())).toEqual([
      "/a/one",
      "/b/two",
      "/b/nested",
      "/loose",
    ]);
  });
});
