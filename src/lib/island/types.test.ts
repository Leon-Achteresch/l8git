import { describe, expect, it } from "vitest";

import {
  acceptsIslandSnapshot,
  activeRepoOf,
  EMPTY_ISLAND_SNAPSHOT,
  findRepo,
  sameIslandSnapshot,
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

describe("sameIslandSnapshot", () => {
  const base: IslandSnapshot = {
    ...EMPTY_ISLAND_SNAPSHOT,
    repos: [repo("/code/one")],
    activePath: "/code/one",
    installedAgents: ["claude"],
  };

  it("ignores the revision counter", () => {
    expect(sameIslandSnapshot(base, { ...base, revision: 99 })).toBe(true);
  });

  it("treats a fresh but equal snapshot as unchanged", () => {
    const rebuilt: IslandSnapshot = {
      ...base,
      repos: [repo("/code/one")],
      installedAgents: ["claude"],
    };
    expect(sameIslandSnapshot(base, rebuilt)).toBe(true);
  });

  it.each([
    ["active repository", { activePath: "/code/two" }],
    ["minimized state", { mainMinimized: true }],
    ["detached state", { detached: true }],
    ["repository count", { repos: [] }],
    ["installed agents", { installedAgents: ["claude", "codex"] }],
    ["dropped agent detection", { installedAgents: null }],
    ["usage rows", { usage: [{ id: "codex", primary: { usedPercent: 73, windowDurationMins: 300, resetsAt: 1 }, secondary: null }] }],
  ])("notices a change to the %s", (_label, patch) => {
    expect(sameIslandSnapshot(base, { ...base, ...patch })).toBe(false);
  });

  it.each([
    ["branch", { branch: "feature" }],
    ["dirty count", { dirty: 3 }],
    ["ahead count", { ahead: 1 }],
    ["behind count", { behind: 2 }],
    ["running agents", { running: ["claude"] }],
    ["busy agents", { busy: ["claude"] }],
    ["path", { path: "/code/other" }],
  ])("notices a change to a repository's %s", (_label, patch) => {
    const changed: IslandSnapshot = {
      ...base,
      repos: [{ ...repo("/code/one"), ...patch }],
    };
    expect(sameIslandSnapshot(base, changed)).toBe(false);
  });

  it("notices reordered repositories", () => {
    const two: IslandSnapshot = {
      ...base,
      repos: [repo("/code/one"), repo("/code/two")],
    };
    const flipped: IslandSnapshot = {
      ...base,
      repos: [repo("/code/two"), repo("/code/one")],
    };
    expect(sameIslandSnapshot(two, flipped)).toBe(false);
  });
});

describe("acceptsIslandSnapshot", () => {
  const host = (session: string, revision: number): IslandSnapshot => ({
    ...EMPTY_ISLAND_SNAPSHOT,
    session,
    revision,
  });

  it("accepts a newer revision from the same host", () => {
    expect(acceptsIslandSnapshot(host("a", 4), host("a", 5))).toBe(true);
  });

  it("accepts a repeat of the current revision", () => {
    expect(acceptsIslandSnapshot(host("a", 4), host("a", 4))).toBe(true);
  });

  it("drops a snapshot that overtook a newer one", () => {
    expect(acceptsIslandSnapshot(host("a", 5), host("a", 4))).toBe(false);
  });

  it("accepts a restarted host whose counter began again", () => {
    // The regression this guards: without the session the island would ignore
    // every snapshot until the new counter passed the old one.
    expect(acceptsIslandSnapshot(host("a", 120), host("b", 1))).toBe(true);
  });

  it("accepts the first snapshot after starting empty", () => {
    expect(acceptsIslandSnapshot(EMPTY_ISLAND_SNAPSHOT, host("a", 1))).toBe(true);
  });
});
