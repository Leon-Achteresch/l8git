import { describe, expect, it } from "vitest";

import type { AgentOverviewEntry } from "@/lib/agents/overview";
import type { InboxCiItem, InboxPrItem, InboxSections } from "@/lib/inbox";

import {
  buildInboxNotifications,
  countInboxTabs,
  countUnread,
  filterInboxNotifications,
  groupInboxNotifications,
} from "@/components/inbox/inbox-notifications";

function pr(over: Partial<InboxPrItem> & { key: string }): InboxPrItem {
  return {
    path: "/repo/app",
    repoName: "app",
    number: 1,
    title: "Add feature",
    author: "leon",
    isDraft: false,
    sourceBranch: "feature/x",
    targetBranch: "main",
    htmlUrl: "https://github.com/acme/app/pull/1",
    updatedAt: "2026-08-12T10:00:00Z",
    reviewers: [],
    provider: "github",
    checks: "unknown",
    ...over,
  };
}

function ci(over: Partial<InboxCiItem> & { key: string }): InboxCiItem {
  return {
    path: "/repo/app",
    repoName: "app",
    runId: 1,
    name: "CI",
    branch: "main",
    conclusion: "failure",
    event: "push",
    runNumber: 7,
    htmlUrl: "https://github.com/acme/app/actions/runs/1",
    updatedAt: "2026-08-12T09:00:00Z",
    ...over,
  };
}

function agent(over: Partial<AgentOverviewEntry> & { key: string }): AgentOverviewEntry {
  return {
    provider: "opencode",
    threadId: "t1",
    path: "/repo/app",
    repoName: "app",
    basePath: "/repo/app",
    branch: "main",
    isWorktree: false,
    title: "Refactor auth",
    preview: "",
    updatedAt: 1_786_000_000,
    status: "running",
    pendingRequests: 0,
    costUsd: null,
    tokens: 0,
    ...over,
  };
}

const sections: InboxSections = {
  myPrs: [pr({ key: "/repo/app#1" }), pr({ key: "/repo/app#2", number: 2 })],
  reviewRequested: [pr({ key: "/repo/app#2", number: 2, title: "Review me" })],
  redRuns: [ci({ key: "/repo/app@1" })],
};

describe("buildInboxNotifications", () => {
  it("dedupliziert PRs zugunsten von Review und sortiert nach Zeit", () => {
    const notifications = buildInboxNotifications(sections, [agent({ key: "a1" })]);
    // #2 erscheint nur einmal (als Review), dazu #1, 1 CI-Run und 1 Agent
    expect(notifications).toHaveLength(4);
    expect(notifications.filter((n) => n.key === "/repo/app#2")).toHaveLength(1);
    expect(notifications.find((n) => n.key === "/repo/app#2")?.category).toBe("review");
    const times = notifications.map((n) =>
      n.kind === "agent" ? n.agent.updatedAt * 1000 : Date.parse(n.kind === "pr" ? n.pr.updatedAt : n.ci.updatedAt),
    );
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("zaehlt Tabs, filtert und gruppiert in Prioritaetsreihenfolge", () => {
    const notifications = buildInboxNotifications(sections, [agent({ key: "a1" })]);
    expect(countInboxTabs(notifications)).toMatchObject({ all: 4, mine: 1, review: 1, ci: 1, agents: 1 });
    expect(filterInboxNotifications(notifications, "ci")).toHaveLength(1);
    expect(filterInboxNotifications(notifications, "all")).toHaveLength(4);
    expect(groupInboxNotifications(notifications).map((g) => g.category)).toEqual([
      "review",
      "ci",
      "agents",
      "mine",
    ]);
  });

  it("zaehlt ungelesene anhand der Read-Keys", () => {
    const notifications = buildInboxNotifications(sections, []);
    expect(countUnread(notifications, [])).toBe(3);
    expect(countUnread(notifications, ["/repo/app#1", "/repo/app@1"])).toBe(1);
  });
});
