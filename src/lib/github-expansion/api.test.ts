import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HubAccount } from "@/lib/hub/types";
vi.mock("@/lib/hub/api", () => ({ enc: encodeURIComponent, hubApi: vi.fn(), gql: vi.fn() }));
import { hubApi, gql } from "@/lib/hub/api";
import { addComment, dispatchWorkflow, getIssue, getPull, getPullMeta, listComments, listProjectFields, listSubjectProjects, listReviewThreads, parseGithubSubjectUrl, permanentCodeLink, readTemplate, requestReviewers, reviewComparisonFingerprint, searchIssues, searchMentionables, setMergeQueue, setPullDraft, updateIssue, updatePullRequest } from "./api";

const account: HubAccount = { host: "github.com", provider: "github", login: "alice", name: null, avatar_url: null };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gql).mockResolvedValue({ markPullRequestReadyForReview: { pullRequest: { id: "PR_1" } }, enqueuePullRequest: { mergeQueueEntry: { id: "Q_1" } } });
});
describe("GitHub expansion transport", () => {
  it("rejects provider confusion and invalid repository paths before sending", () => {
    expect(() => getIssue({ ...account, provider: "gitlab" }, "a/b", 1)).toThrow("only supported");
    for (const repo of ["a/b/c", "a/..", "a/b?x", "a/"]) expect(() => getIssue(account, repo, 1)).toThrow();
    expect(() => getIssue(account, "a/b", 0)).toThrow();
    expect(hubApi).not.toHaveBeenCalled();
  });
  it("routes lifecycle and metadata updates to the correct API resource", async () => {
    await updateIssue(account, "a/b", 12, { state: "closed", milestone: null, assignees: ["bob"] });
    expect(hubApi).toHaveBeenLastCalledWith(account, "PATCH", "/repos/a/b/issues/12", { state: "closed", milestone: null, assignees: ["bob"] });
    await updatePullRequest(account, "a/b", 13, { base: "release/v1", title: "Fix" });
    expect(hubApi).toHaveBeenLastCalledWith(account, "PATCH", "/repos/a/b/pulls/13", { base: "release/v1", title: "Fix" });
    await requestReviewers(account, "a/b", 13, ["bob"], ["backend"]);
    expect(hubApi).toHaveBeenLastCalledWith(account, "POST", "/repos/a/b/pulls/13/requested_reviewers", { reviewers: ["bob"], team_reviewers: ["backend"] });
    expect(() => addComment(account, "a/b", 1, " ")).toThrow();
  });
  it("preserves pagination and GitHub search's 1000-result ceiling", async () => {
    vi.mocked(hubApi).mockResolvedValueOnce(Array.from({ length: 100 }, () => ({})));
    expect((await listComments(account, "a/b", 1, 2)).hasMore).toBe(true);
    expect(hubApi).toHaveBeenLastCalledWith(account, "GET", "/repos/a/b/issues/1/comments?per_page=100&page=2");
    vi.mocked(hubApi).mockResolvedValueOnce({ items: Array.from({ length: 100 }, () => ({})), total_count: 2000, incomplete_results: true });
    expect(await searchIssues(account, "is:pr author:alice", 10)).toMatchObject({ hasMore: false, total: 2000, incomplete: true });
  });
  it("uses GraphQL lifecycle mutations and pins queue submission to a reviewed head", async () => {
    await setPullDraft(account, "PR_1", false);
    expect(gql).toHaveBeenLastCalledWith(account, expect.stringContaining("markPullRequestReadyForReview"), { id: "PR_1" });
    await expect(setMergeQueue(account, "PR_1", true)).rejects.toThrow("reviewed head");
    await setMergeQueue(account, "PR_1", true, "a".repeat(40));
    expect(gql).toHaveBeenLastCalledWith(account, expect.stringContaining("expectedHeadOid"), { id: "PR_1", head: "a".repeat(40) });
  });
  it("does not claim mutation success on null or partial-error GraphQL results", async () => {
    vi.mocked(gql).mockResolvedValueOnce({ markPullRequestReadyForReview: null });
    await expect(setPullDraft(account, "PR_1", false)).rejects.toThrow("did not confirm");
  });
  it("dispatches explicit refs/inputs and decodes UTF-8 templates", async () => {
    await dispatchWorkflow(account, "a/b", 9, "feature/x", { dry_run: true });
    expect(hubApi).toHaveBeenLastCalledWith(account, "POST", "/repos/a/b/actions/workflows/9/dispatches", { ref: "feature/x", inputs: { dry_run: true }, return_run_details: true });
    vi.mocked(hubApi).mockResolvedValueOnce({ type: "file", encoding: "base64", content: "R3LDvMOfZQ==" });
    expect(await readTemplate(account, "a/b", ".github/PULL_REQUEST_TEMPLATE.md", "main")).toBe("Grüße");
  });
  it("preserves the exact dispatch result and does not retry an accepted or ambiguous dispatch", async () => {
    const result = { workflow_run_id: 42, html_url: "https://github.com/a/b/actions/runs/42" };
    vi.mocked(hubApi).mockResolvedValueOnce(result);
    expect(await dispatchWorkflow(account, "a/b", 9, "main")).toBe(result);
    vi.mocked(hubApi).mockRejectedValueOnce(new Error("connection closed"));
    await expect(dispatchWorkflow(account, "a/b", 9, "main")).rejects.toThrow("connection closed");
    expect(hubApi).toHaveBeenCalledTimes(2);
    vi.mocked(hubApi).mockResolvedValueOnce(null);
    const enterprise = { ...account, host: "git.example.com" };
    expect(await dispatchWorkflow(enterprise, "a/b", 9, "main")).toBeNull();
    expect(hubApi).toHaveBeenLastCalledWith(enterprise, "POST", "/repos/a/b/actions/workflows/9/dispatches", { ref: "main", inputs: {} });
  });
  it("uses the Git blob fallback for repository text omitted by the contents API", async () => {
    vi.mocked(hubApi).mockResolvedValueOnce({ type: "file", sha: "blob", size: 1_100_000, encoding: "none", content: "" }).mockResolvedValueOnce({ encoding: "base64", content: "aGVsbG8=" });
    expect(await readTemplate(account, "a/b", "CODEOWNERS", "pinned")).toBe("hello");
    expect(hubApi).toHaveBeenLastCalledWith(account, "GET", "/repos/a/b/git/blobs/blob");
  });
  it("returns REST requested teams and full GraphQL PR metadata with explicit connection pagination", async () => {
    vi.mocked(hubApi).mockResolvedValueOnce({ requested_teams: [{ slug: "backend" }], base: { sha: "base" }, head: { sha: "head" } });
    expect(await getPull(account, "a/b", 1)).toMatchObject({ requested_teams: [{ slug: "backend" }], base: { sha: "base" } });
    const connection = (nodes: unknown[], more = false) => ({ nodes, pageInfo: { hasNextPage: more, endCursor: more ? "next" : null } });
    vi.mocked(gql).mockResolvedValueOnce({ repository: { pullRequest: {
      id: "PR_1", title: "Title", body: "Body", state: "OPEN", isDraft: false, baseRefName: "main", headRefName: "feature", headRefOid: "head", baseRefOid: "base", mergeStateStatus: "CLEAN", mergeable: "MERGEABLE", reviewDecision: "APPROVED", viewerCanUpdate: true, mergeQueueEntry: null,
      labels: connection([{ name: "bug", color: "ff0000" }]), assignees: connection([{ login: "alice", avatarUrl: "avatar", url: "profile" }]), milestone: { number: 2, title: "v2", state: "OPEN", dueOn: null },
      reviewRequests: connection([{ requestedReviewer: { __typename: "Team", slug: "backend", organization: { login: "org" } } }, { requestedReviewer: { __typename: "User", login: "bob" } }], true),
      latestReviews: connection([{ author: { login: "bob" }, state: "APPROVED", commit: { oid: "head" } }]), closingIssuesReferences: connection([{ id: "I_1", number: 3, title: "Bug", state: "OPEN", url: "issue", repository: { nameWithOwner: "a/b" } }]),
    } } });
    const meta = await getPullMeta(account, "a/b", 1, { reviewRequests: "previous" });
    expect(meta).toMatchObject({ nodeId: "PR_1", baseRefOid: "base", headRefOid: "head", reviewRequests: [{ kind: "team", slug: "backend", organization: "org" }, { kind: "user", login: "bob" }], latestReviews: [{ login: "bob", state: "APPROVED", commitOid: "head" }], pagination: { reviewRequests: { hasNextPage: true, endCursor: "next" } } });
    expect(gql).toHaveBeenLastCalledWith(account, expect.stringContaining("baseRefOid"), expect.objectContaining({ reviewRequests: "previous" }));
  });
  it("searches repository users and org teams while preserving users on org permission failure", async () => {
    const users = { nodes: [{ login: "alice", name: "Alice" }], pageInfo: { hasNextPage: false, endCursor: null } };
    vi.mocked(gql).mockResolvedValueOnce({ repository: { mentionableUsers: users, owner: { __typename: "Organization", login: "org" } } }).mockResolvedValueOnce({ organization: { teams: { nodes: [{ slug: "backend", name: "Backend" }], pageInfo: { hasNextPage: true, endCursor: "team-next" } } } });
    const found = await searchMentionables(account, "org/repo", "org/back");
    expect(found).toMatchObject({ hasMore: true, teamsCursor: "team-next", teamsUnavailable: false });
    expect(found.items.map(item => item.insert)).toEqual(["@alice", "@org/backend"]);
    expect(gql).toHaveBeenLastCalledWith(account, expect.stringContaining("teams(first"), { owner: "org", query: "back", cursor: null });
    vi.mocked(gql).mockResolvedValueOnce({ repository: { mentionableUsers: users, owner: { __typename: "Organization", login: "org" } } }).mockRejectedValueOnce(new Error("403 read:org required"));
    expect(await searchMentionables(account, "org/repo", "ali")).toMatchObject({ teamsUnavailable: true, items: [{ kind: "user", login: "alice", label: "alice (Alice)", insert: "@alice" }] });
  });
  it("loads three user pages and two team pages in three rounds without restarting exhausted connections", async () => {
    const usersSeen: (string | null)[] = [], teamsSeen: (string | null)[] = [];
    vi.mocked(gql).mockImplementation(async (_a, query, variables = {}) => {
      if (query.includes("organization(login")) {
        const cursor = variables.cursor as string | null; teamsSeen.push(cursor);
        const index = cursor === null ? 1 : 2;
        return { organization: { teams: { nodes: [{ slug: `team${index}`, name: `Team ${index}` }], pageInfo: { hasNextPage: index < 2, endCursor: `teams-${index}` } } } };
      }
      const data: { mentionableUsers?: unknown; owner: { __typename: string; login: string } } = { owner: { __typename: "Organization", login: "org" } };
      if (query.includes("mentionableUsers(")) {
        const cursor = variables.users as string | null; usersSeen.push(cursor);
        const index = cursor === null ? 1 : cursor === "users-1" ? 2 : 3;
        data.mentionableUsers = { nodes: [{ login: `user${index}`, name: null }], pageInfo: { hasNextPage: index < 3, endCursor: `users-${index}` } };
      }
      return { repository: data };
    });
    const first = await searchMentionables(account, "org/repo", "");
    const second = await searchMentionables(account, "org/repo", "", { users: first.usersCursor, teams: first.teamsCursor });
    const third = await searchMentionables(account, "org/repo", "", { users: second.usersCursor, teams: second.teamsCursor });
    expect([first.items, second.items, third.items].flat().map(item => item.insert)).toEqual(["@user1", "@org/team1", "@user2", "@org/team2", "@user3"]);
    expect(usersSeen).toEqual([null, "users-1", "users-2"]);
    expect(teamsSeen).toEqual([null, "teams-1"]);
    expect(third.hasMore).toBe(false);
    const calls = vi.mocked(gql).mock.calls.length;
    expect(await searchMentionables(account, "org/repo", "", { users: null, teams: null })).toMatchObject({ items: [], hasMore: false });
    expect(gql).toHaveBeenCalledTimes(calls);
  });
  it("skips exhausted users while continuing teams with an owner-only lookup", async () => {
    vi.mocked(gql).mockResolvedValueOnce({ repository: { owner: { __typename: "Organization", login: "org" } } })
      .mockResolvedValueOnce({ organization: { teams: { nodes: [{ slug: "last", name: "Last" }], pageInfo: { hasNextPage: false, endCursor: "last" } } } });
    const found = await searchMentionables(account, "org/repo", "", { users: null, teams: "next" });
    expect(vi.mocked(gql).mock.calls[0][1]).not.toContain("mentionableUsers");
    expect(vi.mocked(gql).mock.calls[0][2]).toEqual({ owner: "org", name: "repo" });
    expect(found).toMatchObject({ items: [{ kind: "team", insert: "@org/last" }], hasMore: false });
  });
  it("does not retry unavailable teams while later user pages continue", async () => {
    vi.mocked(gql).mockResolvedValueOnce({ repository: { mentionableUsers: { nodes: [{ login: "first", name: null }], pageInfo: { hasNextPage: true, endCursor: "users-next" } }, owner: { __typename: "Organization", login: "org" } } })
      .mockRejectedValueOnce(new Error("403 read:org required"))
      .mockResolvedValueOnce({ repository: { mentionableUsers: { nodes: [{ login: "last", name: null }], pageInfo: { hasNextPage: false, endCursor: null } }, owner: { __typename: "Organization", login: "org" } } });
    const first = await searchMentionables(account, "org/repo", "");
    expect(first).toMatchObject({ teamsUnavailable: true, teamsCursor: null, usersCursor: "users-next" });
    const last = await searchMentionables(account, "org/repo", "", { users: first.usersCursor, teams: first.teamsCursor });
    expect(last).toMatchObject({ items: [{ login: "last" }], hasMore: false });
    expect(vi.mocked(gql).mock.calls.filter(([, query]) => query.includes("organization(login"))).toHaveLength(1);
  });
  it("exposes project item and field-option cursors instead of silently truncating", async () => {
    vi.mocked(gql).mockResolvedValueOnce({ node: { projectItems: { nodes: [{ id: "item" }], pageInfo: { hasNextPage: true, endCursor: "items-next" } } } });
    expect(await listSubjectProjects(account, "I_1", "items-prev")).toEqual({ items: [{ id: "item" }], hasMore: true, cursor: "items-next" });
    vi.mocked(gql).mockResolvedValueOnce({ node: { fields: { nodes: [{ id: "field", name: "Status", dataType: "SINGLE_SELECT", options: [{ id: "option", name: "Done" }] }], pageInfo: { hasNextPage: true, endCursor: "fields-next" } } } });
    expect(await listProjectFields(account, "P_1", "fields-prev")).toMatchObject({ hasMore: true, cursor: "fields-next", items: [{ options: [{ id: "option", name: "Done" }] }] });
  });
});
describe("permanent links and internal URLs", () => {
  it("preserves both range sides and original positions for review-thread consumers", async () => {
    const thread = { id: "thread", path: "a.ts", isResolved: false, isOutdated: false, line: 9, startLine: 4, diffSide: "RIGHT", startDiffSide: "LEFT", originalLine: 8, originalStartLine: 3, comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } };
    vi.mocked(gql).mockResolvedValueOnce({ repository: { pullRequest: { reviewThreads: { nodes: [thread], pageInfo: { hasNextPage: false, endCursor: null } } } } });
    expect((await listReviewThreads(account, "a/b", 1)).items).toEqual([thread]);
    expect(gql).toHaveBeenLastCalledWith(account, expect.stringContaining("startDiffSide originalLine originalStartLine"), expect.objectContaining({ number: 1 }));
  });
  it("review fingerprints include both complete blob sides and file modes", () => {
    const state = { mergeBase: "base", head: "head", complete: true, baseEntries: { "a.ts": { path: "a.ts", mode: "100644", type: "blob", sha: "old" } }, headEntries: { "a.ts": { path: "a.ts", mode: "100644", type: "blob", sha: "new" } } };
    const original = reviewComparisonFingerprint(state, "a.ts");
    expect(reviewComparisonFingerprint({ ...state, head: "unrelated-rebase" }, "a.ts")).toBe(original);
    expect(reviewComparisonFingerprint({ ...state, baseEntries: { "a.ts": { ...state.baseEntries["a.ts"], sha: "changed-base" } } }, "a.ts")).not.toBe(original);
    expect(reviewComparisonFingerprint({ ...state, headEntries: { "a.ts": { ...state.headEntries["a.ts"], mode: "100755" } } }, "a.ts")).not.toBe(original);
    expect(reviewComparisonFingerprint({ ...state, complete: false }, "a.ts")).toBeNull();
  });
  it("requires a full commit and encodes paths and line ranges", () => {
    expect(permanentCodeLink(account, "a/b", "a".repeat(40), "src/my file.ts", 3, 9)).toBe(`https://github.com/a/b/blob/${"a".repeat(40)}/src/my%20file.ts#L3-L9`);
    expect(() => permanentCodeLink(account, "a/b", "main", "a.ts")).toThrow();
    expect(() => permanentCodeLink(account, "a/b", "a".repeat(40), "a.ts", 9, 3)).toThrow();
  });
  it("only resolves authenticated GitHub host subjects and rejects ambiguous URLs", () => {
    expect(parseGithubSubjectUrl("https://github.com/a/b/pull/42#discussion", [account])).toEqual({ account, repo: "a/b", kind: "pull", number: 42 });
    for (const url of ["https://evil.test/a/b/pull/42", "http://github.com/a/b/issues/1", "https://u:p@github.com/a/b/pull/42", "https://github.com/a%2Fb/c/pull/42", "https://github.com/a/b/issues/9007199254740993"]) expect(parseGithubSubjectUrl(url, [account])).toBeNull();
  });
});
