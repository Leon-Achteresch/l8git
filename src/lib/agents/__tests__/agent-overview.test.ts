import { describe, expect, it } from "vitest";

import {
  buildProviderEntries,
  compareOverviewEntries,
  countPendingRequests,
  countRunningTurns,
  filterOverviewEntries,
  groupEntriesByRepo,
  groupFleetLanes,
  isThreadWorking,
  knownPathEntries,
  overviewCounts,
  overviewRepoName,
  overviewStatus,
  sortOverviewEntries,
  threadCostKey,
  type AgentOverviewEntry,
  type ProviderOverviewInput,
} from "@/lib/agents/overview";
import type { AgentConversation, AgentThreadSummary } from "@/lib/agents/types";

function thread(overrides: Partial<AgentThreadSummary> = {}): AgentThreadSummary {
  return {
    id: "t1",
    path: "/repo",
    title: "Thread",
    preview: "Preview",
    createdAt: 100,
    updatedAt: 200,
    status: "idle",
    modelProvider: "openai",
    ...overrides,
  };
}

function conversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
  return {
    threadId: "t1",
    path: "/repo",
    title: "Thread",
    model: "gpt-5",
    reasoningEffort: null,
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    turns: [],
    activeTurnId: null,
    loading: false,
    error: null,
    ...overrides,
  };
}

function input(overrides: Partial<ProviderOverviewInput> = {}): ProviderOverviewInput {
  return { threadsByPath: {}, conversations: {}, requestsByThread: {}, ...overrides };
}

function entry(overrides: Partial<AgentOverviewEntry> = {}): AgentOverviewEntry {
  return {
    key: "codex:t1",
    provider: "codex",
    threadId: "t1",
    path: "/repo",
    repoName: "repo",
    basePath: "/repo",
    branch: null,
    isWorktree: false,
    title: "Thread",
    preview: "",
    updatedAt: 100,
    status: "idle",
    pendingRequests: 0,
    costUsd: null,
    tokens: 0,
    ...overrides,
  };
}

describe("overviewRepoName", () => {
  it("uses the last path segment on both separators", () => {
    expect(overviewRepoName("/Users/leon/Repositories/l8git")).toBe("l8git");
    expect(overviewRepoName("C:\\code\\l8git\\")).toBe("l8git");
    expect(overviewRepoName("l8git")).toBe("l8git");
  });
});

describe("isThreadWorking", () => {
  it("treats only idle and notLoaded as quiet", () => {
    expect(isThreadWorking("idle")).toBe(false);
    expect(isThreadWorking("notLoaded")).toBe(false);
    expect(isThreadWorking("active")).toBe(true);
  });
});

describe("overviewStatus", () => {
  it("ranks pending approvals above a running turn", () => {
    expect(
      overviewStatus({ threadStatus: "active", activeTurnId: "turn-1", pendingRequests: 1 }),
    ).toBe("awaitingApproval");
  });

  it("reports running for an active turn or a working thread status", () => {
    expect(overviewStatus({ threadStatus: "idle", activeTurnId: "turn-1" })).toBe("running");
    expect(overviewStatus({ threadStatus: "active" })).toBe("running");
  });

  it("reports failures only when nothing is running", () => {
    expect(overviewStatus({ threadStatus: "idle", error: "boom" })).toBe("failed");
    expect(overviewStatus({ threadStatus: "idle", lastTurnFailed: true })).toBe("failed");
    expect(overviewStatus({ threadStatus: "active", error: "boom" })).toBe("running");
  });

  it("falls back to idle", () => {
    expect(overviewStatus({ threadStatus: "idle" })).toBe("idle");
  });
});

describe("sortOverviewEntries", () => {
  it("puts waiting and running first, then sorts by activity", () => {
    const entries = [
      entry({ key: "a", status: "idle", updatedAt: 900 }),
      entry({ key: "b", status: "running", updatedAt: 100 }),
      entry({ key: "c", status: "awaitingApproval", updatedAt: 50 }),
      entry({ key: "d", status: "failed", updatedAt: 800 }),
      entry({ key: "e", status: "running", updatedAt: 300 }),
    ];
    expect(sortOverviewEntries(entries).map((item) => item.key)).toEqual(["c", "e", "b", "d", "a"]);
  });

  it("does not mutate the input", () => {
    const entries = [entry({ key: "a", status: "idle" }), entry({ key: "b", status: "running" })];
    sortOverviewEntries(entries);
    expect(entries.map((item) => item.key)).toEqual(["a", "b"]);
  });

  it("is stable for identical status and timestamp", () => {
    expect(compareOverviewEntries(entry({ key: "a" }), entry({ key: "b" }))).toBeLessThan(0);
  });
});

describe("overviewCounts", () => {
  it("counts per status and sums the active ones", () => {
    const counts = overviewCounts([
      entry({ status: "running" }),
      entry({ status: "running" }),
      entry({ status: "awaitingApproval" }),
      entry({ status: "failed" }),
      entry({ status: "idle" }),
    ]);
    expect(counts).toEqual({ running: 2, awaitingApproval: 1, failed: 1, idle: 1, active: 3 });
  });
});

describe("countRunningTurns and countPendingRequests", () => {
  it("counts live turns and threads with open requests", () => {
    expect(countRunningTurns({ a: { activeTurnId: "t" }, b: { activeTurnId: null } })).toBe(1);
    expect(countPendingRequests({ a: [1, 2], b: [], c: [3] })).toBe(2);
  });
});

describe("buildProviderEntries", () => {
  it("maps threads of every repo and skips archived ones", () => {
    const entries = buildProviderEntries(
      "claude",
      input({
        threadsByPath: {
          "/repo-a": [thread({ id: "t1" }), thread({ id: "t2", archived: true })],
          "/repo-b": [thread({ id: "t3", path: "/repo-b" })],
        },
      }),
      {},
    );
    expect(entries.map((item) => item.threadId)).toEqual(["t1", "t3"]);
    expect(entries[0].key).toBe(threadCostKey("claude", "t1"));
    expect(entries[1].repoName).toBe("repo-b");
  });

  it("marks worktree threads with their agents branch", () => {
    const entries = buildProviderEntries(
      "codex",
      input({ threadsByPath: { "/repo.worktrees/fix": [thread()] } }),
      {
        "/repo.worktrees/fix": {
          path: "/repo.worktrees/fix",
          basePath: "/repo",
          branch: "agents/fix",
          createdAt: 1,
        },
      },
    );
    expect(entries[0]).toMatchObject({
      isWorktree: true,
      branch: "agents/fix",
      basePath: "/repo",
    });
  });

  it("derives status from conversation state and pending requests", () => {
    const entries = buildProviderEntries(
      "codex",
      input({
        threadsByPath: { "/repo": [thread({ id: "t1" }), thread({ id: "t2" })] },
        conversations: { t1: conversation({ activeTurnId: "turn-1" }) },
        requestsByThread: { t2: [{ requestId: 1 }] as never },
      }),
      {},
    );
    expect(entries[0].status).toBe("running");
    expect(entries[1].status).toBe("awaitingApproval");
    expect(entries[1].pendingRequests).toBe(1);
  });

  it("prefers the ledger cost and falls back to the live estimate", () => {
    const entries = buildProviderEntries(
      "codex",
      input({
        threadsByPath: { "/repo": [thread({ id: "t1" }), thread({ id: "t2" })] },
        conversations: {
          t2: conversation({
            threadId: "t2",
            tokenUsage: {
              totalTokens: 2_000_000,
              modelContextWindow: null,
              inputTokens: 1_000_000,
              outputTokens: 1_000_000,
            },
          }),
        },
      }),
      {},
      { "codex:t1": { costUsd: 1.5, tokens: 4_000 } },
    );
    expect(entries[0].costUsd).toBe(1.5);
    expect(entries[0].tokens).toBe(4_000);
    expect(entries[1].costUsd).toBeCloseTo(11.25, 5);
    expect(entries[1].tokens).toBe(2_000_000);
  });

  it("leaves the cost null when neither source knows the thread", () => {
    const entries = buildProviderEntries("codex", input({ threadsByPath: { "/repo": [thread()] } }), {});
    expect(entries[0].costUsd).toBeNull();
    expect(entries[0].tokens).toBe(0);
  });
});

describe("knownPathEntries", () => {
  it("drops threads of repos that left the workspace", () => {
    const entries = [entry({ key: "a", path: "/repo-a" }), entry({ key: "b", path: "/gone" })];
    expect(knownPathEntries(entries, ["/repo-a"]).map((item) => item.key)).toEqual(["a"]);
  });

  it("keeps everything while the workspace list is still empty", () => {
    const entries = [entry({ path: "/repo-a" })];
    expect(knownPathEntries(entries, [])).toBe(entries);
  });
});

describe("filterOverviewEntries", () => {
  it("matches title, preview, repo and branch case-insensitively", () => {
    const entries = [
      entry({ key: "a", title: "Refactor parser" }),
      entry({ key: "b", title: "Other", preview: "fix the PARSER" }),
      entry({ key: "c", title: "Other", repoName: "parser-tools" }),
      entry({ key: "d", title: "Other", branch: "agents/parser" }),
      entry({ key: "e", title: "Other" }),
    ];
    expect(filterOverviewEntries(entries, "parser").map((item) => item.key)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("returns the input for an empty query", () => {
    const entries = [entry()];
    expect(filterOverviewEntries(entries, "  ")).toBe(entries);
  });
});

describe("groupFleetLanes", () => {
  it("puts approvals and failures in needsYou", () => {
    const lanes = groupFleetLanes([
      entry({ key: "a", status: "awaitingApproval" }),
      entry({ key: "b", status: "failed" }),
      entry({ key: "c", status: "running" }),
      entry({ key: "d", status: "idle" }),
    ]);
    expect(lanes.needsYou.map((item) => item.key)).toEqual(["a", "b"]);
    expect(lanes.working.map((item) => item.key)).toEqual(["c"]);
    expect(lanes.ready.map((item) => item.key)).toEqual(["d"]);
  });
});

describe("groupEntriesByRepo", () => {
  it("groups by basePath so worktrees sit with their repo", () => {
    const groups = groupEntriesByRepo([
      entry({ key: "a", path: "/repo", basePath: "/repo", repoName: "repo" }),
      entry({
        key: "b",
        path: "/repo.worktrees/fix",
        basePath: "/repo",
        repoName: "repo",
        isWorktree: true,
      }),
      entry({ key: "c", path: "/other", basePath: "/other", repoName: "other" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ path: "/repo", repoName: "repo" });
    expect(groups[0].entries.map((item) => item.key)).toEqual(["a", "b"]);
    expect(groups[1].repoName).toBe("other");
  });
});
