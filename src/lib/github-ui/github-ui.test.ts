import { describe, expect, it } from "vitest";

import type { MergeReadiness } from "@/lib/github-expansion/api";

import { mergeQueueRequired, readinessRows, readinessVerdict } from "./readiness";
import { parseHubPath, parseRemoteUrl, resolveTarget } from "./target";

const base: MergeReadiness = {
  id: "PR_1", headRefOid: "a".repeat(40), baseRefName: "main", isDraft: false,
  mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: "APPROVED", viewerCanUpdate: true,
  autoMergeRequest: null, mergeQueueEntry: null,
  reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
  commits: { nodes: [{ commit: { oid: "a".repeat(40), statusCheckRollup: { state: "SUCCESS" } } }] },
};

describe("merge readiness", () => {
  it("is ready only when GitHub reports CLEAN and no conflicts", () => {
    expect(readinessVerdict(readinessRows(base, []))).toBe("ok");
  });
  it("conflict-free is not the same as requirements met", () => {
    const rows = readinessRows({ ...base, mergeStateStatus: "BLOCKED" }, []);
    expect(rows.find((r) => r.id === "conflicts")?.tone).toBe("ok");
    expect(readinessVerdict(rows)).toBe("fail");
  });
  it("keeps unknown mergeability unknown instead of ready", () => {
    const rows = readinessRows({ ...base, mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }, []);
    expect(readinessVerdict(rows)).toBe("unknown");
  });
  it("treats unloaded rules as unknown and required thread resolution as failing", () => {
    const r = { ...base, reviewThreads: { nodes: [{ id: "t", isResolved: false, isOutdated: false }], pageInfo: { hasNextPage: true, endCursor: "x" } } };
    expect(readinessRows(r, null).find((x) => x.id === "rules")?.tone).toBe("unknown");
    const rows = readinessRows(r, [{ type: "pull_request", parameters: { required_review_thread_resolution: true } }]);
    expect(rows.find((x) => x.id === "threads")).toMatchObject({ tone: "fail", values: { count: 1, more: "+" } });
  });
  it("detects merge queue rules", () => {
    expect(mergeQueueRequired([{ type: "merge_queue" }])).toBe(true);
    expect(mergeQueueRequired(null)).toBe(false);
  });
});

describe("github target", () => {
  it("parses remote url forms", () => {
    expect(parseRemoteUrl("git@github.com:o/r.git")).toEqual({ host: "github.com", fullName: "o/r" });
    expect(parseRemoteUrl("https://GitHub.com/o/r")).toEqual({ host: "github.com", fullName: "o/r" });
    expect(parseRemoteUrl("ssh://git@ghe.corp:22/o/r.git")).toEqual({ host: "ghe.corp", fullName: "o/r" });
    expect(parseRemoteUrl("nonsense")).toBeNull();
    expect(parseHubPath("hub:me@github.com/o/r")).toEqual({ login: "me", host: "github.com", fullName: "o/r" });
  });
  it("resolves accounts and reports misses", () => {
    const gh = { host: "github.com", provider: "github" as const, login: "me", name: null, avatar_url: null };
    const gl = { ...gh, host: "gitlab.com", provider: "gitlab" as const };
    expect(resolveTarget("/x", [], [gh], null)).toEqual({ reason: "no-remote" });
    expect(resolveTarget("/x", [{ name: "origin", url: "git@bitbucket.org:o/r" }], [gh], null)).toEqual({ reason: "no-account" });
    expect(resolveTarget("/x", [{ name: "origin", url: "git@gitlab.com:o/r" }], [gl], null)).toEqual({ reason: "not-github" });
    expect(resolveTarget("/x", [{ name: "origin", url: "git@github.com:o/r" }], [gh], null)).toMatchObject({ fullName: "o/r", account: gh });
  });
});

import { parseLineRange } from "@/components/repo/github/pr-permalink-button";

describe("permalink line ranges", () => {
  it("parses ranges and rejects malformed ones", () => {
    expect(parseLineRange("")).toEqual([]);
    expect(parseLineRange("12")).toEqual([12, undefined]);
    expect(parseLineRange("L12-L20")).toEqual([12, 20]);
    expect(parseLineRange("20-12")).toBeNull();
    expect(parseLineRange("0")).toBeNull();
    expect(parseLineRange("x")).toBeNull();
  });
});

import { reviewTasks } from "./review-tasks";

describe("review tasks", () => {
  const c = (id: string, extra: Partial<import("@/lib/pr-threads").PrComment> = {}) => ({
    id, author: "rev", author_avatar: null, created_at: `2026-01-0${id}`, body: `b${id}`, kind: "inline", file_path: "a.ts", line: 3, thread_id: "T", ...extra,
  });
  it("drops remotely resolved threads and keeps unknown state honest", () => {
    const comments = [c("1"), c("2", { in_reply_to: "1" }), c("3", { file_path: "b.ts", thread_id: "U" }), c("4", { kind: "issue", file_path: null, line: null })];
    expect(reviewTasks(comments, null).map((x) => x.remote)).toEqual(["unknown", "unknown"]);
    const tasks = reviewTasks(comments, [{ id: "RT1", resolved: true, comment_ids: ["1", "2"] }, { id: "RT2", resolved: false, comment_ids: ["3"] }]);
    expect(tasks).toEqual([expect.objectContaining({ id: "RT2", file: "b.ts", remote: "open", replies: 0 })]);
  });
});

// Check reminders (38) moved to the canonical head-pinned store: see remaining-ui.test.ts.

import { groupInbox, snoozeUntil, waitingOn } from "./inbox-model";

describe("inbox model", () => {
  const n = (id: string, reason: string, updatedAt: string, url = `u${id}`) => ({ id, title: id, repo: "o/r", type: "PullRequest", reason, unread: true, updatedAt, url });
  it("separates waiting on me vs others with private override", () => {
    expect(waitingOn("review_requested")).toBe("me");
    expect(waitingOn("author")).toBe("others");
    expect(waitingOn("author", "me")).toBe("me");
    expect(waitingOn("weird")).toBeNull();
  });
  it("groups by subject, snoozes until change, pins and flags new since visit", () => {
    const list = [n("1", "comment", "2026-01-02T00:00:00Z", "A"), n("2", "review_requested", "2026-01-03T00:00:00Z", "A"), n("3", "author", "2026-01-01T00:00:00Z", "B"), n("4", "mention", "2026-01-04T00:00:00Z", "C")];
    const subjects = { B: { pinned: true }, C: { snooze: { untilChangedFrom: "2026-01-04T00:00:00Z" } } };
    const g = groupInbox(list, (x) => x.url!, subjects, Date.parse("2026-01-02T12:00:00Z"));
    const by = Object.fromEntries(g.map((x) => [x.key, x]));
    expect(by.A.items.map((i) => i.id)).toEqual(["2", "1"]);
    expect(by.A.section).toBe("me");
    expect(by.A.newSinceVisit).toBe(true);
    expect(by.B.section).toBe("pinned");
    expect(by.C.section).toBe("snoozed");
    // a newer event on C wakes it up
    const woke = groupInbox([...list, n("5", "mention", "2026-01-05T00:00:00Z", "C")], (x) => x.url!, subjects, null);
    expect(woke.find((x) => x.key === "C")?.section).toBe("me");
  });
  it("resolves snooze presets in local time", () => {
    const base = new Date(2026, 0, 7, 15, 0); // Wednesday
    expect(snoozeUntil("1h", base)).toBe(base.getTime() + 3_600_000);
    expect(new Date(snoozeUntil("tomorrow", base)).getDate()).toBe(8);
    const week = new Date(snoozeUntil("week", base));
    expect([week.getDay(), week.getHours()]).toEqual([1, 9]);
  });
});

import { searchChips, toggleChip } from "./search-chips";

describe("search chips", () => {
  it("toggles tokens without touching the rest of the query", () => {
    expect(toggleChip("is:open label:bug", "author:@me")).toBe("is:open label:bug author:@me");
    expect(toggleChip("is:open author:@me label:bug", "author:@me")).toBe("is:open label:bug");
    expect([...searchChips("team-review-requested:o/t is:pr")]).toEqual(["is:pr", "team-review-requested:"]);
    expect(toggleChip("team-review-requested:o/t", "team-review-requested:")).toBe("");
  });
});

import { issueBodyFromCode } from "@/components/repo/github/issue-from-diff";

describe("issue from diff", () => {
  it("pins the permalink and fences code safely", () => {
    const body = issueBodyFromCode("a/b.ts", "f".repeat(40), "https://github.com/o/r/blob/fff/a/b.ts#L2-L3", 2, 3, "x ``` y");
    expect(body).toContain("https://github.com/o/r/blob/fff/a/b.ts#L2-L3");
    expect(body).toContain("````ts\nx ``` y\n````");
    expect(body).toContain("L2-L3 @ `ffffffffffff`");
  });
});

import { semanticKind } from "@/components/repo/github/semantic-diff";

describe("semantic diff kinds", () => {
  it("routes files to supported structural views", () => {
    expect(semanticKind("a/package-lock.json")).toBe("npm-lock");
    expect(semanticKind("README.md")).toBe("markdown");
    expect(semanticKind("x.yml")).toBe("yaml");
    expect(semanticKind("x.json")).toBe("json");
    expect(semanticKind("x.ts")).toBeNull();
  });
});
