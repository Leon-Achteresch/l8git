import { describe, expect, it } from "vitest";

import {
  islandAction,
  ISLAND_ACTIONS,
  listedIslandActions,
  searchIslandActions,
  type IslandActionDef,
} from "@/lib/island/actions";

const label = (action: IslandActionDef) => action.labelKey;

describe("island action registry", () => {
  it("has unique ids", () => {
    const ids = ISLAND_ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("looks actions up by id", () => {
    expect(islandAction("git.push")?.group).toBe("git");
    expect(islandAction("nope.nope")).toBeUndefined();
  });

  it("lists every registered action", () => {
    expect(listedIslandActions().map((action) => action.id)).toEqual(
      ISLAND_ACTIONS.map((action) => action.id),
    );
  });

  it("describes every argument it accepts", () => {
    for (const action of ISLAND_ACTIONS) {
      for (const arg of action.args ?? []) {
        expect(arg.name).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
        expect(arg.description.trim()).toBeTruthy();
      }
    }
  });
});

describe("searchIslandActions", () => {
  it("returns everything for an empty query", () => {
    expect(searchIslandActions(ISLAND_ACTIONS, "   ", label)).toHaveLength(
      ISLAND_ACTIONS.length,
    );
  });

  it("matches keywords, ids and labels", () => {
    const byKeyword = searchIslandActions(ISLAND_ACTIONS, "hochladen", label);
    expect(byKeyword.map((a) => a.id)).toContain("git.push");

    const byId = searchIslandActions(ISLAND_ACTIONS, "view.ci", label);
    expect(byId.map((a) => a.id)).toEqual(["view.ci"]);
  });

  it("requires every term to match", () => {
    expect(searchIslandActions(ISLAND_ACTIONS, "branch create", label).map((a) => a.id)).toContain(
      "git.createBranch",
    );
    expect(searchIslandActions(ISLAND_ACTIONS, "push zzzz", label)).toHaveLength(0);
  });

  it("ignores case", () => {
    expect(searchIslandActions(ISLAND_ACTIONS, "PUSH", label).map((a) => a.id)).toContain(
      "git.push",
    );
  });
});
