import { describe, expect, it } from "vitest";

import {
  aiCallableActions,
  islandAction,
  islandActionForTool,
  islandToolName,
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

  it("keeps hidden actions out of the command list but callable by the chat", () => {
    const listed = listedIslandActions().map((action) => action.id);
    expect(listed).not.toContain("read.status");
    expect(aiCallableActions().map((action) => action.id)).toContain("read.status");
  });

  it("only exposes actions that describe themselves to the model", () => {
    for (const action of aiCallableActions()) {
      expect(action.ai?.trim()).toBeTruthy();
    }
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

describe("islandToolName", () => {
  it("produces names the model providers accept", () => {
    for (const action of aiCallableActions()) {
      expect(islandToolName(action)).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    }
  });

  it("round-trips back to its action", () => {
    for (const action of aiCallableActions()) {
      expect(islandActionForTool(islandToolName(action))?.id).toBe(action.id);
    }
  });

  it("returns nothing for an unknown tool", () => {
    expect(islandActionForTool("definitely_not_a_tool")).toBeUndefined();
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
