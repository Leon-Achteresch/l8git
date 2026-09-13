import { describe, expect, it } from "vitest";

import {
  aggregateOverviewByInstance,
  type AgentOverviewEntry,
} from "@/lib/agents/overview";
import { dedupeFinishedTurns, finishedTurns } from "@/lib/agents/turn-attention";
import { instanceId } from "@/lib/agents/types";

function entry(overrides: Partial<AgentOverviewEntry>): AgentOverviewEntry {
  return {
    key: overrides.key ?? "k",
    provider: "claude",
    threadId: overrides.threadId ?? "t1",
    path: "/repo",
    repoName: "repo",
    basePath: "/repo",
    branch: null,
    isWorktree: false,
    title: "thread",
    preview: "",
    updatedAt: 0,
    status: "idle",
    pendingRequests: 0,
    costUsd: null,
    tokens: 0,
    ...overrides,
  };
}

describe("aggregateOverviewByInstance", () => {
  it("aggregates running, waitingForApproval and failed per instance", () => {
    const a = instanceId("instance-a");
    const b = instanceId("instance-b");
    const entries: AgentOverviewEntry[] = [
      entry({ key: "1", status: "running" }),
      entry({ key: "2", status: "awaitingApproval" }),
      entry({ key: "3", status: "failed" }),
      entry({ key: "4", status: "idle" }),
    ];
    const byKey: Record<string, ReturnType<typeof instanceId>> = {
      "1": a,
      "2": a,
      "3": b,
      "4": b,
    };
    const result = aggregateOverviewByInstance(entries, (e) => byKey[e.key]);
    const instanceA = result.find((r) => r.instanceId === a);
    const instanceB = result.find((r) => r.instanceId === b);
    expect(instanceA).toEqual({ instanceId: a, running: 1, waitingForApproval: 1, rateLimited: 0, failed: 0 });
    expect(instanceB).toEqual({ instanceId: b, running: 0, waitingForApproval: 0, rateLimited: 0, failed: 1 });
  });

  it("marks rate-limited instances even without matching entries", () => {
    const a = instanceId("instance-a");
    const result = aggregateOverviewByInstance([], () => a, new Set([a]));
    expect(result).toEqual([{ instanceId: a, running: 0, waitingForApproval: 0, rateLimited: 1, failed: 0 }]);
  });
});

describe("turn attention dedupe", () => {
  it("signals a finished turn exactly once", () => {
    const previous = { "thread-1": "turn-1" };
    const next: Record<string, string | null> = { "thread-1": null };
    const seen = new Set<string>();

    const first = dedupeFinishedTurns(seen, finishedTurns(previous, next));
    expect(first).toEqual([{ threadId: "thread-1", turnId: "turn-1" }]);

    const second = dedupeFinishedTurns(seen, finishedTurns(previous, next));
    expect(second).toEqual([]);
  });

  it("signals distinct turns independently", () => {
    const seen = new Set<string>();
    const turnsA = finishedTurns({ t1: "turn-1" }, { t1: null });
    const turnsB = finishedTurns({ t1: "turn-2" }, { t1: null });
    expect(dedupeFinishedTurns(seen, turnsA)).toHaveLength(1);
    expect(dedupeFinishedTurns(seen, turnsB)).toHaveLength(1);
  });
});
