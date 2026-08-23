import { describe, expect, it } from "vitest";

import {
  buildInboxSections,
  checkStateForRun,
  inboxBadgeCount,
  isOpenPr,
  isSameLogin,
  latestRunForBranch,
  normalizeHost,
  parseStoredGitAccounts,
  repoNameFromPath,
  resolveDefaultBranch,
  selectMyPrs,
  selectRedRuns,
  selectReviewRequested,
  stripRemotePrefix,
  viewerLoginForHost,
  type InboxRepoInput,
  type InboxWorkflowRun,
} from "@/lib/inbox";
import type { PullRequest } from "@/lib/repo-store";

function pr(over: Partial<PullRequest>): PullRequest {
  return {
    number: 1,
    title: "Add feature",
    state: "open",
    is_draft: false,
    author: "leon",
    author_avatar: null,
    source_branch: "feature/x",
    target_branch: "main",
    html_url: "https://github.com/acme/app/pull/1",
    created_at: "2026-08-10T10:00:00Z",
    updated_at: "2026-08-12T10:00:00Z",
    labels: [],
    reviewers: [],
    provider: "github",
    ...over,
  };
}

function run(over: Partial<InboxWorkflowRun>): InboxWorkflowRun {
  return {
    id: 1,
    name: "CI",
    status: "completed",
    conclusion: "success",
    workflow_id: 100,
    head_branch: "main",
    head_sha: "abc1234",
    run_number: 1,
    event: "push",
    created_at: "2026-08-12T09:00:00Z",
    updated_at: "2026-08-12T09:10:00Z",
    html_url: "https://github.com/acme/app/actions/runs/1",
    ...over,
  };
}

function repo(over: Partial<InboxRepoInput>): InboxRepoInput {
  return {
    path: "/repos/app",
    repoName: "app",
    viewerLogin: "leon",
    prs: [],
    runs: [],
    ...over,
  };
}

describe("repoNameFromPath", () => {
  it("takes the last segment of posix and windows paths", () => {
    expect(repoNameFromPath("/Users/leon/Repositories/l8git")).toBe("l8git");
    expect(repoNameFromPath("C:\\dev\\l8git\\")).toBe("l8git");
    expect(repoNameFromPath("")).toBe("");
  });
});

describe("isSameLogin", () => {
  it("compares case-insensitively and rejects empty logins", () => {
    expect(isSameLogin("Leon", "leon")).toBe(true);
    expect(isSameLogin(" leon ", "leon")).toBe(true);
    expect(isSameLogin("", "")).toBe(false);
    expect(isSameLogin(null, "leon")).toBe(false);
  });
});

describe("parseStoredGitAccounts / viewerLoginForHost", () => {
  it("parses the persisted account list and resolves the login per host", () => {
    const raw = JSON.stringify([
      { id: "github", name: "GitHub", host: "github.com", username: "leon", builtin: true },
      { id: "custom-ghe", name: "GHE", host: "GHE.acme.io", username: "  ", builtin: false },
    ]);
    const accounts = parseStoredGitAccounts(raw);
    expect(accounts).toEqual([
      { host: "github.com", username: "leon" },
      { host: "GHE.acme.io", username: null },
    ]);
    expect(viewerLoginForHost(accounts, "github.com")).toBe("leon");
    expect(viewerLoginForHost(accounts, "www.GitHub.com")).toBe("leon");
    expect(viewerLoginForHost(accounts, "ghe.acme.io")).toBeNull();
    expect(viewerLoginForHost(accounts, "gitlab.com")).toBeNull();
  });

  it("survives broken payloads", () => {
    expect(parseStoredGitAccounts(null)).toEqual([]);
    expect(parseStoredGitAccounts("{not json")).toEqual([]);
    expect(parseStoredGitAccounts('{"host":"x"}')).toEqual([]);
    expect(parseStoredGitAccounts('[1,null,{"nope":true}]')).toEqual([]);
  });

  it("normalises hosts", () => {
    expect(normalizeHost(" WWW.GitHub.Com ")).toBe("github.com");
    expect(normalizeHost(null)).toBe("");
  });
});

describe("isOpenPr", () => {
  it("accepts open, opened and draft states only", () => {
    expect(isOpenPr(pr({ state: "open" }))).toBe(true);
    expect(isOpenPr(pr({ state: "opened" }))).toBe(true);
    expect(isOpenPr(pr({ state: "draft" }))).toBe(true);
    expect(isOpenPr(pr({ state: "merged" }))).toBe(false);
    expect(isOpenPr(pr({ state: "closed" }))).toBe(false);
  });
});

describe("stripRemotePrefix / resolveDefaultBranch", () => {
  it("strips origin and refs prefixes", () => {
    expect(stripRemotePrefix("origin/main")).toBe("main");
    expect(stripRemotePrefix("refs/heads/develop")).toBe("develop");
    expect(stripRemotePrefix("feature/nested/name")).toBe("feature/nested/name");
  });

  it("prefers the most frequent PR target branch", () => {
    expect(resolveDefaultBranch({ prTargets: ["develop", "develop", "main"] })).toBe("develop");
  });

  it("breaks ties by candidate priority", () => {
    expect(resolveDefaultBranch({ prTargets: ["develop", "main"] })).toBe("main");
  });

  it("falls back to known branch names when no PRs exist", () => {
    expect(resolveDefaultBranch({ branches: ["feature/a", "origin/master"] })).toBe("master");
    expect(resolveDefaultBranch({ branches: ["feature/a"] })).toBeNull();
    expect(resolveDefaultBranch({})).toBeNull();
  });

  it("prefers the branch the provider reports over the heuristic", () => {
    expect(
      resolveDefaultBranch({
        defaultBranch: "origin/release",
        prTargets: ["main", "main"],
        branches: ["main"],
      }),
    ).toBe("release");
    expect(
      resolveDefaultBranch({ defaultBranch: "  ", prTargets: ["develop", "develop"] }),
    ).toBe("develop");
    expect(resolveDefaultBranch({ defaultBranch: null, branches: ["main"] })).toBe("main");
  });
});

describe("latestRunForBranch / checkStateForRun", () => {
  const runs = [
    run({ id: 1, head_branch: "feature/x", conclusion: "failure", updated_at: "2026-08-12T08:00:00Z" }),
    run({ id: 2, head_branch: "feature/x", conclusion: "success", updated_at: "2026-08-12T09:00:00Z" }),
    run({ id: 3, head_branch: "main", conclusion: "failure", updated_at: "2026-08-12T10:00:00Z" }),
  ];

  it("returns the newest run of a branch", () => {
    expect(latestRunForBranch(runs, "feature/x")?.id).toBe(2);
    expect(latestRunForBranch(runs, "unknown")).toBeNull();
    expect(latestRunForBranch(runs, null)).toBeNull();
  });

  it("maps run state to a check state", () => {
    expect(checkStateForRun(null)).toBe("unknown");
    expect(checkStateForRun(run({ conclusion: "success" }))).toBe("success");
    expect(checkStateForRun(run({ conclusion: "timed_out" }))).toBe("failure");
    expect(checkStateForRun(run({ conclusion: null, status: "in_progress" }))).toBe("running");
    expect(checkStateForRun(run({ conclusion: "skipped" }))).toBe("unknown");
  });
});

describe("selectMyPrs", () => {
  it("keeps only open PRs authored by the viewer, newest first", () => {
    const items = selectMyPrs([
      repo({
        prs: [
          pr({ number: 1, author: "Leon", updated_at: "2026-08-11T10:00:00Z" }),
          pr({ number: 2, author: "someone-else" }),
          pr({ number: 3, author: "leon", state: "merged" }),
          pr({ number: 4, author: "leon", state: "draft", is_draft: true, updated_at: "2026-08-13T10:00:00Z" }),
        ],
      }),
    ]);
    expect(items.map((i) => i.number)).toEqual([4, 1]);
    expect(items[0].isDraft).toBe(true);
  });

  it("falls back to all open PRs when no account login is known", () => {
    const items = selectMyPrs([repo({ viewerLogin: null, prs: [pr({ number: 7, author: "nobody" })] })]);
    expect(items.map((i) => i.number)).toEqual([7]);
  });

  it("annotates the check state from the branch run", () => {
    const items = selectMyPrs([
      repo({
        prs: [pr({ source_branch: "feature/x" })],
        runs: [run({ head_branch: "feature/x", conclusion: "failure" })],
      }),
    ]);
    expect(items[0].checks).toBe("failure");
  });
});

describe("selectReviewRequested", () => {
  it("matches the viewer against requested reviewers and skips own PRs", () => {
    const items = selectReviewRequested([
      repo({
        prs: [
          pr({ number: 1, author: "mara", reviewers: [{ login: "Leon", avatar: null }] }),
          pr({ number: 2, author: "mara", reviewers: [{ login: "other", avatar: null }] }),
          pr({ number: 3, author: "leon", reviewers: [{ login: "leon", avatar: null }] }),
          pr({ number: 4, author: "mara", reviewers: [] }),
          pr({ number: 5, author: "mara", state: "merged", reviewers: [{ login: "leon", avatar: null }] }),
        ],
      }),
    ]);
    expect(items.map((i) => i.number)).toEqual([1]);
    expect(items[0].reviewers).toEqual(["Leon"]);
  });

  it("falls back to every open PR with requested reviewers when the login is unknown", () => {
    const items = selectReviewRequested([
      repo({
        viewerLogin: null,
        prs: [
          pr({ number: 1, reviewers: [{ login: "anyone", avatar: null }] }),
          pr({ number: 2, reviewers: [] }),
        ],
      }),
    ]);
    expect(items.map((i) => i.number)).toEqual([1]);
  });
});

describe("selectRedRuns", () => {
  it("reports only the newest failed run per workflow on the default branch", () => {
    const items = selectRedRuns([
      repo({
        prs: [pr({ target_branch: "main" })],
        runs: [
          run({ id: 1, workflow_id: 100, conclusion: "failure", updated_at: "2026-08-12T08:00:00Z" }),
          run({ id: 2, workflow_id: 100, conclusion: "success", updated_at: "2026-08-12T09:00:00Z" }),
          run({ id: 3, workflow_id: 200, conclusion: "failure", updated_at: "2026-08-12T09:30:00Z" }),
          run({ id: 4, workflow_id: 300, conclusion: "failure", head_branch: "feature/x" }),
          run({ id: 5, workflow_id: 400, conclusion: "cancelled" }),
        ],
      }),
    ]);
    expect(items.map((i) => i.runId)).toEqual([3]);
    expect(items[0].branch).toBe("main");
    expect(items[0].conclusion).toBe("failure");
  });

  it("follows the provider default branch even when it looks unusual", () => {
    const items = selectRedRuns([
      repo({
        defaultBranch: "release/1.0",
        prs: [pr({ target_branch: "main" })],
        runs: [
          run({ id: 20, workflow_id: 1, conclusion: "failure", head_branch: "release/1.0" }),
          run({ id: 21, workflow_id: 2, conclusion: "failure", head_branch: "main" }),
        ],
      }),
    ]);
    expect(items.map((i) => i.runId)).toEqual([20]);
  });

  it("uses candidate branch names when nothing resolves the default branch", () => {
    const items = selectRedRuns([
      repo({
        prs: [],
        runs: [
          run({ id: 9, workflow_id: 1, conclusion: "failure", head_branch: "master" }),
          run({ id: 10, workflow_id: 2, conclusion: "failure", head_branch: "release/1.0" }),
        ],
      }),
    ]);
    expect(items.map((i) => i.runId)).toEqual([9]);
  });

  it("respects a repo whose default branch is develop", () => {
    const items = selectRedRuns([
      repo({
        prs: [pr({ target_branch: "develop" }), pr({ number: 2, target_branch: "develop" })],
        runs: [
          run({ id: 11, workflow_id: 1, conclusion: "failure", head_branch: "develop" }),
          run({ id: 12, workflow_id: 2, conclusion: "failure", head_branch: "main" }),
        ],
      }),
    ]);
    expect(items.map((i) => i.runId)).toEqual([11]);
  });
});

describe("buildInboxSections", () => {
  it("aggregates across repositories and counts the badge signals", () => {
    const sections = buildInboxSections([
      repo({
        path: "/repos/app",
        repoName: "app",
        prs: [
          pr({ number: 1, author: "leon" }),
          pr({ number: 2, author: "mara", reviewers: [{ login: "leon", avatar: null }] }),
        ],
        runs: [run({ id: 1, workflow_id: 1, conclusion: "failure" })],
      }),
      repo({
        path: "/repos/api",
        repoName: "api",
        viewerLogin: "leon",
        prs: [pr({ number: 5, author: "leon", updated_at: "2026-08-14T10:00:00Z" })],
        runs: [run({ id: 2, workflow_id: 1, conclusion: "success" })],
      }),
    ]);
    expect(sections.myPrs.map((i) => `${i.repoName}#${i.number}`)).toEqual(["api#5", "app#1"]);
    expect(sections.reviewRequested.map((i) => i.number)).toEqual([2]);
    expect(sections.redRuns.map((i) => i.repoName)).toEqual(["app"]);
    expect(inboxBadgeCount(sections)).toBe(2);
  });

  it("returns empty sections for no repositories", () => {
    const sections = buildInboxSections([]);
    expect(sections.myPrs).toEqual([]);
    expect(inboxBadgeCount(sections)).toBe(0);
  });
});
