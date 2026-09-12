import { describe, expect, it } from "vitest";

import { nextAttentionTarget, pendingApprovals } from "@/lib/agents/turn-attention";
import { dedupeInboxApprovals, type InboxApprovalItem } from "@/lib/inbox";
import type { AgentOverviewEntry } from "@/lib/agents/overview";

function entry(key: string, status: AgentOverviewEntry["status"], updatedAt: number): AgentOverviewEntry {
  return {
    key,
    provider: "claude",
    threadId: key,
    path: "/repo",
    repoName: "repo",
    basePath: "/repo",
    branch: null,
    isWorktree: false,
    title: key,
    preview: "",
    updatedAt,
    status,
    pendingRequests: status === "awaitingApproval" ? 1 : 0,
    costUsd: null,
    tokens: 0,
  };
}

describe("ASK-09 pendingApprovals", () => {
  it("returns only awaiting-approval entries sorted by longest waiting first", () => {
    const overview = [
      entry("running", "running", 10),
      entry("waiting-recent", "awaitingApproval", 8),
      entry("waiting-old", "awaitingApproval", 2),
    ];
    const result = pendingApprovals(overview);
    expect(result.map((e) => e.key)).toEqual(["waiting-old", "waiting-recent"]);
  });

  it("nextAttentionTarget cycles through the list without auto-selecting on null current", () => {
    const list = [entry("a", "awaitingApproval", 1), entry("b", "awaitingApproval", 2)];
    expect(nextAttentionTarget(null, list)?.key).toBe("a");
    expect(nextAttentionTarget("a", list)?.key).toBe("b");
    expect(nextAttentionTarget("b", list)?.key).toBe("a");
    expect(nextAttentionTarget("unknown", list)?.key).toBe("a");
    expect(nextAttentionTarget(null, [])).toBeNull();
  });
});

describe("ASK-09 inbox approval dedup", () => {
  it("removes duplicate entries by key", () => {
    const items: InboxApprovalItem[] = [
      { key: "host:t1", hostId: "host", instanceId: "inst", threadId: "t1", title: "a", waitingSinceMs: 1 },
      { key: "host:t1", hostId: "host", instanceId: "inst", threadId: "t1", title: "a", waitingSinceMs: 1 },
      { key: "host:t2", hostId: "host", instanceId: "inst", threadId: "t2", title: "b", waitingSinceMs: 2 },
    ];
    expect(dedupeInboxApprovals(items).map((i) => i.key)).toEqual(["host:t1", "host:t2"]);
  });
});
