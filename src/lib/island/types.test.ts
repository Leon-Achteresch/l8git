import { describe, expect, it } from "vitest";

import {
  activeRepoOf,
  EMPTY_ISLAND_SNAPSHOT,
  findRepo,
  type IslandRepoSnapshot,
  type IslandSnapshot,
} from "@/lib/island/types";

function repo(path: string): IslandRepoSnapshot {
  return {
    path,
    label: path.split("/").pop() ?? path,
    branch: "main",
    dirty: 0,
    ahead: 0,
    behind: 0,
    running: [],
    busy: [],
  };
}

const snapshot: IslandSnapshot = {
  ...EMPTY_ISLAND_SNAPSHOT,
  repos: [repo("/code/one"), repo("/code/two")],
  activePath: "/code/two",
};

describe("island snapshot helpers", () => {
  it("finds a repository by path", () => {
    expect(findRepo(snapshot, "/code/one")?.label).toBe("one");
  });

  it("returns null for an unknown or missing path", () => {
    expect(findRepo(snapshot, "/code/three")).toBeNull();
    expect(findRepo(snapshot, null)).toBeNull();
  });

  it("resolves the active repository", () => {
    expect(activeRepoOf(snapshot)?.path).toBe("/code/two");
    expect(activeRepoOf(EMPTY_ISLAND_SNAPSHOT)).toBeNull();
  });
});
