import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/platform/kv", () => ({ platformStorage: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, value); },
  removeItem: (key: string) => { memory.delete(key); },
} }));

import { changeWorkflowKey, useChangeWorkflow } from "./store";
import type { ChangeInitiative, ReviewNarrative } from "./model";

beforeEach(() => {
  memory.clear();
  useChangeWorkflow.setState({ narratives: {}, evidence: {}, initiatives: {} });
});

describe("persisted change workflows", () => {
  it("keeps account-scoped narratives separate and persists immutable snapshots", async () => {
    const narrative: ReviewNarrative = { id: "12", scope: "alice", pullNumber: 12, title: "API", chapters: [] };
    useChangeWorkflow.getState().saveNarrative(narrative);
    useChangeWorkflow.getState().saveNarrative({ ...narrative, scope: "bob", title: "Other account" });
    narrative.title = "Mutated outside store";
    expect(useChangeWorkflow.getState().narratives[changeWorkflowKey("alice", "12")].title).toBe("API");
    await useChangeWorkflow.persist.rehydrate();
    expect(Object.keys(useChangeWorkflow.getState().narratives)).toHaveLength(2);
    useChangeWorkflow.getState().removeNarrative("alice", "12");
    expect(Object.values(useChangeWorkflow.getState().narratives).map(item => item.title)).toEqual(["Other account"]);
  });

  it("does not save an unexecutable initiative containing a dependency cycle", () => {
    const initiative: ChangeInitiative = { id: "x", scope: "org", name: "Change", steps: [
      { id: "a", repository: "org/a", branch: "feature", headSha: "head", dependsOn: ["a"], status: "pending" },
    ] };
    expect(() => useChangeWorkflow.getState().saveInitiative(initiative)).toThrow(/cycle/);
    expect(useChangeWorkflow.getState().initiatives).toEqual({});
  });
});
