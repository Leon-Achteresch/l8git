import { formatBackendError } from '@/lib/backend-error';
import { enc, gql, hubApi } from "@/lib/hub/api";
import { invoke } from "@tauri-apps/api/core";
import type { HubAccount } from "@/lib/hub/types";

export type Page<T> = { items: T[]; page: number; hasMore: boolean; total?: number; incomplete?: boolean };
export type GithubUser = { login: string; avatar_url?: string; html_url?: string };
export type GithubLabel = { name: string; color: string; description?: string | null };
export type GithubMilestone = { number: number; title: string; state: string; due_on: string | null };
export type GithubIssue = {
  id: number; node_id: string; number: number; title: string; body: string | null;
  state: "open" | "closed"; state_reason: string | null; html_url: string;
  user: GithubUser | null; assignees: GithubUser[]; labels: (GithubLabel | string)[];
  milestone: GithubMilestone | null; comments: number; updated_at: string;
  pull_request?: { url: string; html_url: string };
};
export type GithubComment = { id: number; body: string; user: GithubUser | null; created_at: string; updated_at: string; html_url: string };
export type IssueUpdate = { title?: string; body?: string; state?: "open" | "closed"; state_reason?: "completed" | "not_planned" | "reopened"; assignees?: string[]; milestone?: number | null };
export type PullUpdate = { title?: string; body?: string; state?: "open" | "closed"; base?: string };
export type GithubWorkflow = { id: number; name: string; path: string; state: string; html_url: string };
export type GithubArtifact = { id: number; name: string; size_in_bytes: number; expired: boolean; expires_at: string; created_at: string; digest?: string; workflow_run?: { id: number; head_sha: string; head_branch: string } };
export type GithubDeployment = { id: number; ref: string; sha: string; environment: string; description: string | null; created_at: string };
export type GithubDeploymentStatus = { id: number; state: string; description: string | null; environment_url: string | null; log_url: string | null; created_at: string };
export type GithubTemplate = { path: string; name: string; sha: string };
export type GithubDownload = { base64: string; content_type: string; file_name: string; size: number };
export type TreeEntry = { path: string; mode: string; type: string; sha: string };
export type ReviewTreeState = { mergeBase: string; head: string; complete: boolean; baseEntries: Record<string, TreeEntry>; headEntries: Record<string, TreeEntry> };

/** Full blob+mode pairs detect changes that a truncated provider patch cannot represent. */
export async function getReviewTreeState(a: HubAccount, repo: string, base: string, head: string): Promise<ReviewTreeState> {
  for (const sha of [base, head]) if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(sha)) throw new Error("Review trees require full pinned commit IDs.");
  const root = repoPath(a, repo);
  const comparison = await hubApi<{ merge_base_commit: { sha: string } }>(a, "GET", `${root}/compare/${base}...${head}?per_page=1`);
  const mergeBase = comparison.merge_base_commit.sha;
  const tree = async (sha: string) => {
    const commit = await hubApi<{ tree: { sha: string } }>(a, "GET", `${root}/git/commits/${sha}`);
    return hubApi<{ tree: TreeEntry[]; truncated: boolean }>(a, "GET", `${root}/git/trees/${commit.tree.sha}?recursive=1`);
  };
  const [left, right] = await Promise.all([tree(mergeBase), tree(head)]);
  const entries = (list: TreeEntry[]) => Object.fromEntries(list.filter(entry => entry.type !== "tree").map(entry => [entry.path, entry]));
  return { mergeBase, head, complete: !left.truncated && !right.truncated, baseEntries: entries(left.tree), headEntries: entries(right.tree) };
}
export function reviewComparisonFingerprint(state: ReviewTreeState, path: string, previousPath?: string | null): string | null {
  if (!state.complete) return null;
  const oldPath = previousPath ?? path;
  const before = Object.prototype.hasOwnProperty.call(state.baseEntries, oldPath) ? state.baseEntries[oldPath] : undefined;
  const after = Object.prototype.hasOwnProperty.call(state.headEntries, path) ? state.headEntries[path] : undefined;
  if (!before && !after) return null;
  return JSON.stringify(["blob-pair-v1", previousPath ?? path, path, before?.sha ?? null, before?.mode ?? null, after?.sha ?? null, after?.mode ?? null]);
}

export function downloadGithubFile(a: HubAccount, repo: string, kind: "job_logs" | "run_logs" | "artifact", id: number): Promise<GithubDownload> {
  repoPath(a, repo); positive(id, "download ID");
  return invoke("hub_download", { host: a.host, login: a.login, fullName: repo, kind, id });
}

function github(a: HubAccount) {
  if (a.provider !== "github") throw new Error("This action is only supported on GitHub.");
}
function repoPath(a: HubAccount, fullName: string): string {
  github(a);
  const parts = fullName.split("/");
  if (parts.length !== 2 || parts.some(p => !p || p === "." || p === ".." || /[\x00-\x20\\?#]/.test(p))) throw new Error("Expected owner/repository.");
  return `/repos/${parts.map(enc).join("/")}`;
}
function positive(n: number, label: string): number {
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Invalid ${label}.`);
  return n;
}
function paging(page: number) { return `per_page=100&page=${positive(page, "page")}`; }
function nonempty(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} must not be empty.`);
  return value;
}
async function mutation(a: HubAccount, query: string, variables: Record<string, unknown>, field: string): Promise<void> {
  const data = await gql<Record<string, unknown>>(a, query, variables);
  if (!data || data[field] == null) throw new Error("GitHub did not confirm the requested operation.");
}
function issuePath(a: HubAccount, repo: string, number: number) { return `${repoPath(a, repo)}/issues/${positive(number, "issue number")}`; }
function pullPath(a: HubAccount, repo: string, number: number) { return `${repoPath(a, repo)}/pulls/${positive(number, "pull request number")}`; }
async function list<T>(a: HubAccount, path: string, page: number): Promise<Page<T>> {
  const items = await hubApi<T[]>(a, "GET", `${path}${path.includes("?") ? "&" : "?"}${paging(page)}`);
  return { items, page, hasMore: items.length === 100 };
}

export function getIssue(a: HubAccount, repo: string, number: number): Promise<GithubIssue> {
  return hubApi(a, "GET", issuePath(a, repo, number));
}
export function createIssue(a: HubAccount, repo: string, title: string, body: string, metadata: { labels?: string[]; assignees?: string[]; milestone?: number } = {}): Promise<GithubIssue> {
  return hubApi(a, "POST", `${repoPath(a, repo)}/issues`, { title: nonempty(title, "Issue title"), body, ...metadata });
}
export function listComments(a: HubAccount, repo: string, number: number, page = 1): Promise<Page<GithubComment>> {
  return list(a, `${issuePath(a, repo, number)}/comments`, page);
}
export function updateIssue(a: HubAccount, repo: string, number: number, update: IssueUpdate): Promise<GithubIssue> {
  if (update.title !== undefined) nonempty(update.title, "Title");
  return hubApi(a, "PATCH", issuePath(a, repo, number), update);
}
export function addComment(a: HubAccount, repo: string, number: number, body: string): Promise<GithubComment> {
  return hubApi(a, "POST", `${issuePath(a, repo, number)}/comments`, { body: nonempty(body, "Comment") });
}
export function updatePullRequest(a: HubAccount, repo: string, number: number, update: PullUpdate): Promise<unknown> {
  if (update.title !== undefined) nonempty(update.title, "Title");
  if (update.base !== undefined) nonempty(update.base, "Base branch");
  return hubApi(a, "PATCH", pullPath(a, repo, number), update);
}
export async function setPullDraft(a: HubAccount, nodeId: string, draft: boolean): Promise<void> {
  github(a); nonempty(nodeId, "Pull request node ID");
  const name = draft ? "convertPullRequestToDraft" : "markPullRequestReadyForReview";
  await mutation(a, `mutation($id: ID!) { ${name}(input: {pullRequestId: $id}) { pullRequest { id isDraft } } }`, { id: nodeId }, name);
}
export function listLabels(a: HubAccount, repo: string, page = 1): Promise<Page<GithubLabel>> {
  return list(a, `${repoPath(a, repo)}/labels`, page);
}
export function listAssignees(a: HubAccount, repo: string, page = 1): Promise<Page<GithubUser>> {
  return list(a, `${repoPath(a, repo)}/assignees`, page);
}
export function listOrganizationTeams(a: HubAccount, organization: string, page = 1): Promise<Page<{ id: number; name: string; slug: string }>> {
  github(a);
  if (!organization || /[\/\s\\?#]/.test(organization) || organization === "." || organization === "..") throw new Error("Invalid organization.");
  return list(a, `/orgs/${enc(organization)}/teams`, page);
}
export async function searchMentionUsers(a: HubAccount, query: string, page = 1): Promise<Page<GithubUser>> {
  github(a); nonempty(query, "User query");
  if (page > 10) throw new Error("Narrow the user search to fewer than 1,000 results.");
  const data = await hubApi<{ items: GithubUser[]; total_count: number; incomplete_results: boolean }>(a, "GET", `/search/users?q=${enc(query)}&${paging(page)}`);
  return { items: data.items, total: data.total_count, incomplete: data.incomplete_results, page, hasMore: data.items.length === 100 && page * 100 < Math.min(data.total_count, 1000) };
}
export type Mentionable = { kind: "user" | "team"; login: string; label: string; insert: string };
export async function searchMentionables(a: HubAccount, repo: string, query: string, cursors: { users?: string | null; teams?: string | null } = {}): Promise<{ items: Mentionable[]; hasMore: boolean; usersCursor: string | null; teamsCursor: string | null; teamsUnavailable: boolean }> {
  repoPath(a, repo);
  // Omitted = first page; explicit null = this independent connection is exhausted.
  const loadUsers = cursors.users !== null, loadTeams = cursors.teams !== null;
  if (!loadUsers && !loadTeams) return { items: [], hasMore: false, usersCursor: null, teamsCursor: null, teamsUnavailable: false };
  const [owner, name] = repo.split("/");
  const teamQuery = query.toLowerCase().startsWith(`${owner.toLowerCase()}/`) ? query.slice(owner.length + 1) : query;
  type Users = Connection<{ login: string; name: string | null }>;
  type Teams = Connection<{ slug: string; name: string }>;
  const data = await gql<{ repository: { mentionableUsers?: Users; owner: { __typename: string; login: string } } | null }>(a, `query($owner: String!, $name: String!${loadUsers ? ", $query: String!, $users: String" : ""}) {
    repository(owner: $owner, name: $name) {
      ${loadUsers ? "mentionableUsers(first: 100, after: $users, query: $query) { nodes { login name } pageInfo { hasNextPage endCursor } }" : ""}
      owner { __typename login }
    }
  }`, { owner, name, ...(loadUsers ? { query, users: cursors.users ?? null } : {}) });
  if (!data.repository) throw new Error("Repository mentionables are unavailable.");
  const users = data.repository.mentionableUsers ?? { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
  if (loadUsers && !data.repository.mentionableUsers) throw new Error("Repository mentionable users are unavailable.");
  let teams: Teams | null = null, teamsUnavailable = false;
  if (loadTeams && data.repository.owner.__typename === "Organization") {
    // Keep repository users usable when the account lacks access to org teams.
    try {
      const result = await gql<{ organization: { teams: Teams } | null }>(a, `query($owner: String!, $query: String!, $cursor: String) {
        organization(login: $owner) { teams(first: 100, after: $cursor, query: $query) { nodes { slug name } pageInfo { hasNextPage endCursor } } }
      }`, { owner, query: teamQuery, cursor: cursors.teams ?? null });
      teams = result.organization?.teams ?? null;
      teamsUnavailable = !teams;
    } catch { teamsUnavailable = true; }
  }
  const items: Mentionable[] = [
    ...users.nodes.map(user => ({ kind: "user" as const, login: user.login, label: user.name ? `${user.login} (${user.name})` : user.login, insert: `@${user.login}` })),
    ...(teams?.nodes ?? []).map(team => ({ kind: "team" as const, login: `${owner}/${team.slug}`, label: `${owner}/${team.slug} (${team.name})`, insert: `@${owner}/${team.slug}` })),
  ];
  return { items, hasMore: users.pageInfo.hasNextPage || !!teams?.pageInfo.hasNextPage, usersCursor: users.pageInfo.hasNextPage ? users.pageInfo.endCursor : null, teamsCursor: teams?.pageInfo.hasNextPage ? teams.pageInfo.endCursor : null, teamsUnavailable };
}
export function listMilestones(a: HubAccount, repo: string, page = 1): Promise<Page<GithubMilestone>> {
  return list(a, `${repoPath(a, repo)}/milestones?state=open`, page);
}
export function setLabels(a: HubAccount, repo: string, number: number, labels: string[]): Promise<GithubLabel[]> {
  return hubApi(a, "PUT", `${issuePath(a, repo, number)}/labels`, { labels });
}
export function requestReviewers(a: HubAccount, repo: string, number: number, reviewers: string[], teamReviewers: string[] = []): Promise<unknown> {
  return hubApi(a, "POST", `${pullPath(a, repo, number)}/requested_reviewers`, { reviewers, team_reviewers: teamReviewers });
}
export function removeReviewers(a: HubAccount, repo: string, number: number, reviewers: string[], teamReviewers: string[] = []): Promise<unknown> {
  return hubApi(a, "DELETE", `${pullPath(a, repo, number)}/requested_reviewers`, { reviewers, team_reviewers: teamReviewers });
}

export async function searchIssues(a: HubAccount, query: string, page = 1): Promise<Page<GithubIssue>> {
  github(a); nonempty(query, "Search query");
  if (page > 10) throw new Error("GitHub search exposes at most 1,000 results; narrow the query.");
  const data = await hubApi<{ items: GithubIssue[]; total_count: number; incomplete_results: boolean }>(a, "GET", `/search/issues?q=${enc(query)}&${paging(page)}`);
  // GitHub search only exposes the first 1,000 matching results.
  return { items: data.items, total: data.total_count, incomplete: data.incomplete_results, page, hasMore: data.items.length === 100 && page * 100 < Math.min(data.total_count, 1000) };
}

type ContentEntry = { type: string; name: string; path: string; sha: string; size?: number; encoding?: string; content?: string };
export async function listRepositoryDirectory(a: HubAccount, repo: string, path: string, ref?: string): Promise<{ name: string; path: string; sha: string; type: string }[]> {
  if (path && path.split("/").some(p => !p || p === "." || p === "..")) throw new Error("Invalid repository path.");
  const data = await hubApi<ContentEntry[] | ContentEntry>(a, "GET", `${repoPath(a, repo)}/contents${path ? `/${path.split("/").map(enc).join("/")}` : ""}${ref ? `?ref=${enc(ref)}` : ""}`);
  if (!Array.isArray(data)) throw new Error("Expected a repository directory.");
  return data.map(({ name, path, sha, type }) => ({ name, path, sha, type }));
}
function isNotFound(error: unknown) { return /(?:^|\s)404(?:\s|:|$)/.test(String(error)); }
export async function listTemplates(a: HubAccount, repo: string, ref?: string): Promise<GithubTemplate[]> {
  const root = `${repoPath(a, repo)}/contents`;
  const suffix = ref ? `?ref=${enc(ref)}` : "";
  const templates = new Map<string, GithubTemplate>();
  for (const dir of ["", ".github", "docs", ".github/PULL_REQUEST_TEMPLATE", "docs/PULL_REQUEST_TEMPLATE", "PULL_REQUEST_TEMPLATE"]) {
    let entries: ContentEntry[] | ContentEntry;
    try { entries = await hubApi(a, "GET", `${root}${dir ? `/${dir.split("/").map(enc).join("/")}` : ""}${suffix}`); }
    catch (error) { if (isNotFound(error)) continue; throw error; }
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (entry.type !== "file") continue;
      const directoryTemplate = dir.endsWith("PULL_REQUEST_TEMPLATE") && /\.md$/i.test(entry.name);
      if (directoryTemplate || /^pull_request_template\.md$/i.test(entry.name)) templates.set(entry.path, { path: entry.path, name: entry.name, sha: entry.sha });
    }
  }
  return [...templates.values()];
}
export async function readTemplate(a: HubAccount, repo: string, path: string, ref?: string): Promise<string> {
  if (path.split("/").some(p => !p || p === "." || p === "..")) throw new Error("Invalid template path.");
  const root = repoPath(a, repo);
  const data = await hubApi<ContentEntry>(a, "GET", `${root}/contents/${path.split("/").map(enc).join("/")}${ref ? `?ref=${enc(ref)}` : ""}`);
  if (data.type !== "file" || data.size !== undefined && data.size >= 3 * 1024 * 1024) throw new Error("Repository text is unavailable or exceeds the 3 MiB limit.");
  const blob = data.encoding === "base64" ? data : await hubApi<{ encoding: string; content: string }>(a, "GET", `${root}/git/blobs/${enc(data.sha)}`);
  if (blob.encoding !== "base64" || typeof blob.content !== "string" || blob.content.length > 4_300_000) throw new Error("Repository text content is unavailable or exceeds the 3 MiB limit.");
  const bytes = Uint8Array.from(atob(blob.content.replace(/\s/g, "")), c => c.charCodeAt(0));
  if (bytes.length >= 3 * 1024 * 1024) throw new Error("Repository text exceeds the 3 MiB limit.");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
export async function listWorkflows(a: HubAccount, repo: string, page = 1): Promise<Page<GithubWorkflow>> {
  const data = await hubApi<{ total_count: number; workflows: GithubWorkflow[] }>(a, "GET", `${repoPath(a, repo)}/actions/workflows?${paging(page)}`);
  return { items: data.workflows, total: data.total_count, page, hasMore: page * 100 < data.total_count };
}
export type WorkflowDispatchResult = { workflow_run_id?: number; run_url?: string; html_url?: string };
export function dispatchWorkflow(a: HubAccount, repo: string, workflowId: number, ref: string, inputs: Record<string, string | boolean | number> = {}): Promise<WorkflowDispatchResult | null> {
  // The existing transport pins API 2022-11-28; github.com supports opt-in run details.
  // Older Enterprise servers keep their 204 response. Never retry a possibly accepted dispatch.
  return hubApi(a, "POST", `${repoPath(a, repo)}/actions/workflows/${positive(workflowId, "workflow ID")}/dispatches`, { ref: nonempty(ref, "Branch or tag"), inputs, ...(a.host.toLowerCase() === "github.com" ? { return_run_details: true } : {}) });
}
export async function listArtifacts(a: HubAccount, repo: string, runId?: number, page = 1): Promise<Page<GithubArtifact>> {
  const run = runId === undefined ? "" : `/runs/${positive(runId, "run ID")}`;
  const data = await hubApi<{ total_count: number; artifacts: GithubArtifact[] }>(a, "GET", `${repoPath(a, repo)}/actions${run}/artifacts?${paging(page)}`);
  return { items: data.artifacts, total: data.total_count, page, hasMore: page * 100 < data.total_count };
}
export function listDeployments(a: HubAccount, repo: string, sha?: string, page = 1): Promise<Page<GithubDeployment>> {
  return list(a, `${repoPath(a, repo)}/deployments${sha ? `?sha=${enc(sha)}` : ""}`, page);
}
export function listDeploymentStatuses(a: HubAccount, repo: string, deploymentId: number, page = 1): Promise<Page<GithubDeploymentStatus>> {
  return list(a, `${repoPath(a, repo)}/deployments/${positive(deploymentId, "deployment ID")}/statuses`, page);
}

export type MergeReadiness = {
  id: string; headRefOid: string; baseRefName: string; isDraft: boolean;
  baseRefOid?: string; headRefName?: string;
  closingIssuesReferences?: { nodes: LinkedIssue[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus: string; reviewDecision: string | null;
  viewerCanUpdate: boolean;
  autoMergeRequest: { mergeMethod: string } | null;
  mergeQueueEntry: { id: string; position: number | null; state: string } | null;
  reviewThreads: { nodes: { id: string; isResolved: boolean; isOutdated: boolean }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
  commits: { nodes: { commit: { oid: string; statusCheckRollup: { state: string } | null } }[] };
};
export async function getMergeReadiness(a: HubAccount, repo: string, number: number): Promise<MergeReadiness> {
  repoPath(a, repo); positive(number, "pull request number");
  const [owner, name] = repo.split("/");
  const data = await gql<{ repository: { pullRequest: MergeReadiness | null } | null }>(a, `query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) { pullRequest(number: $number) {
      id headRefOid baseRefOid headRefName baseRefName isDraft mergeable mergeStateStatus reviewDecision viewerCanUpdate
      autoMergeRequest { mergeMethod } mergeQueueEntry { id position state }
      reviewThreads(first: 100) { nodes { id isResolved isOutdated } pageInfo { hasNextPage endCursor } }
      commits(last: 1) { nodes { commit { oid statusCheckRollup { state } } } }
      closingIssuesReferences(first: 100) { nodes { id number title url state repository { nameWithOwner } } pageInfo { hasNextPage endCursor } }
    } }
  }`, { owner, name, number });
  if (!data.repository?.pullRequest) throw new Error("Pull request is unavailable or access was denied.");
  return data.repository.pullRequest;
}

export type GithubPull = {
  id: number; node_id: string; number: number; title: string; body: string | null; state: "open" | "closed"; draft: boolean;
  requested_reviewers: GithubUser[]; requested_teams: { id: number; name: string; slug: string }[];
  base: { sha: string; ref: string; repo: { full_name: string } }; head: { sha: string; ref: string; repo: { full_name: string } | null };
};
export function getPull(a: HubAccount, repo: string, number: number): Promise<GithubPull> {
  return hubApi(a, "GET", pullPath(a, repo, number));
}
type Connection<T> = { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
export type PullMeta = {
  nodeId: string; title: string; body: string; state: string; isDraft: boolean;
  baseRefName: string; headRefName: string; headRefOid: string; baseRefOid: string;
  labels: GithubLabel[]; assignees: GithubUser[]; milestone: GithubMilestone | null;
  reviewRequests: ({ kind: "user"; login: string } | { kind: "team"; slug: string; organization: string })[];
  latestReviews: { login: string; state: string; commitOid: string | null }[];
  closingIssues: LinkedIssue[]; mergeStateStatus: string; mergeable: string; reviewDecision: string | null;
  isInMergeQueue: boolean; mergeQueueEntry: MergeReadiness["mergeQueueEntry"]; viewerCanUpdate: boolean;
  pagination: Record<"labels" | "assignees" | "reviewRequests" | "latestReviews" | "closingIssues", { hasNextPage: boolean; endCursor: string | null }>;
};
export async function getPullMeta(a: HubAccount, repo: string, number: number, cursors: Partial<Record<keyof PullMeta["pagination"], string>> = {}): Promise<PullMeta> {
  repoPath(a, repo); positive(number, "pull request number");
  type Raw = Omit<PullMeta, "nodeId" | "labels" | "assignees" | "reviewRequests" | "latestReviews" | "closingIssues" | "milestone" | "isInMergeQueue" | "pagination"> & {
    id: string; labels: Connection<GithubLabel>; assignees: Connection<{ login: string; avatarUrl: string; url: string }>;
    milestone: { number: number; title: string; state: string; dueOn: string | null } | null;
    reviewRequests: Connection<{ requestedReviewer: { __typename: string; login?: string; slug?: string; organization?: { login: string } } | null }>;
    latestReviews: Connection<{ author: { login: string } | null; state: string; commit: { oid: string } | null }>;
    closingIssuesReferences: Connection<LinkedIssue>;
  };
  const [owner, name] = repo.split("/");
  const data = await gql<{ repository: { pullRequest: Raw | null } | null }>(a, `query($owner: String!, $name: String!, $number: Int!, $labels: String, $assignees: String, $reviewRequests: String, $latestReviews: String, $closingIssues: String) {
    repository(owner: $owner, name: $name) { pullRequest(number: $number) {
      id title body state isDraft baseRefName headRefName headRefOid baseRefOid mergeStateStatus mergeable reviewDecision viewerCanUpdate
      mergeQueueEntry { id position state }
      labels(first: 100, after: $labels) { nodes { name color description } pageInfo { hasNextPage endCursor } }
      assignees(first: 100, after: $assignees) { nodes { login avatarUrl url } pageInfo { hasNextPage endCursor } }
      milestone { number title state dueOn }
      reviewRequests(first: 100, after: $reviewRequests) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { slug organization { login } } } } pageInfo { hasNextPage endCursor } }
      latestReviews(first: 100, after: $latestReviews) { nodes { author { login } state commit { oid } } pageInfo { hasNextPage endCursor } }
      closingIssuesReferences(first: 100, after: $closingIssues) { nodes { id number title state url repository { nameWithOwner } } pageInfo { hasNextPage endCursor } }
    } }
  }`, { owner, name, number, labels: cursors.labels ?? null, assignees: cursors.assignees ?? null, reviewRequests: cursors.reviewRequests ?? null, latestReviews: cursors.latestReviews ?? null, closingIssues: cursors.closingIssues ?? null });
  const pr = data.repository?.pullRequest;
  if (!pr) throw new Error("Pull request metadata is unavailable.");
  const reviewRequests: PullMeta["reviewRequests"] = [];
  for (const request of pr.reviewRequests.nodes) {
    const reviewer = request.requestedReviewer;
    if (reviewer?.__typename === "User" && reviewer.login) reviewRequests.push({ kind: "user", login: reviewer.login });
    if (reviewer?.__typename === "Team" && reviewer.slug && reviewer.organization) reviewRequests.push({ kind: "team", slug: reviewer.slug, organization: reviewer.organization.login });
  }
  return { nodeId: pr.id, title: pr.title, body: pr.body, state: pr.state, isDraft: pr.isDraft, baseRefName: pr.baseRefName, headRefName: pr.headRefName, headRefOid: pr.headRefOid, baseRefOid: pr.baseRefOid,
    labels: pr.labels.nodes, assignees: pr.assignees.nodes.map(user => ({ login: user.login, avatar_url: user.avatarUrl, html_url: user.url })),
    milestone: pr.milestone ? { number: pr.milestone.number, title: pr.milestone.title, state: pr.milestone.state.toLowerCase(), due_on: pr.milestone.dueOn } : null,
    reviewRequests, latestReviews: pr.latestReviews.nodes.map(review => ({ login: review.author?.login ?? "unknown", state: review.state, commitOid: review.commit?.oid ?? null })),
    closingIssues: pr.closingIssuesReferences.nodes, mergeStateStatus: pr.mergeStateStatus, mergeable: pr.mergeable, reviewDecision: pr.reviewDecision, isInMergeQueue: pr.mergeQueueEntry !== null, mergeQueueEntry: pr.mergeQueueEntry, viewerCanUpdate: pr.viewerCanUpdate,
    pagination: { labels: pr.labels.pageInfo, assignees: pr.assignees.pageInfo, reviewRequests: pr.reviewRequests.pageInfo, latestReviews: pr.latestReviews.pageInfo, closingIssues: pr.closingIssuesReferences.pageInfo } };
}
export async function getBranchRules(a: HubAccount, repo: string, branch: string): Promise<unknown[]> {
  return hubApi(a, "GET", `${repoPath(a, repo)}/rules/branches/${enc(nonempty(branch, "Branch"))}`);
}
export async function setMergeQueue(a: HubAccount, pullRequestId: string, enqueue: boolean, expectedHeadOid?: string): Promise<void> {
  github(a); nonempty(pullRequestId, "Pull request ID");
  if (enqueue) {
    if (!expectedHeadOid || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(expectedHeadOid)) throw new Error("Enqueue requires the reviewed head commit.");
    await mutation(a, "mutation($id: ID!, $head: GitObjectID!) { enqueuePullRequest(input: {pullRequestId: $id, expectedHeadOid: $head}) { mergeQueueEntry { id } } }", { id: pullRequestId, head: expectedHeadOid }, "enqueuePullRequest");
  } else {
    await mutation(a, "mutation($id: ID!) { dequeuePullRequest(input: {pullRequestId: $id}) { clientMutationId } }", { id: pullRequestId }, "dequeuePullRequest");
  }
}
export function listSubIssues(a: HubAccount, repo: string, number: number, page = 1): Promise<Page<GithubIssue>> {
  return list(a, `${issuePath(a, repo, number)}/sub_issues`, page);
}
export function addSubIssue(a: HubAccount, repo: string, number: number, issueId: number): Promise<unknown> {
  return hubApi(a, "POST", `${issuePath(a, repo, number)}/sub_issues`, { sub_issue_id: positive(issueId, "issue ID") });
}
export function removeSubIssue(a: HubAccount, repo: string, number: number, issueId: number): Promise<unknown> {
  return hubApi(a, "DELETE", `${issuePath(a, repo, number)}/sub_issue`, { sub_issue_id: positive(issueId, "issue ID") });
}

export function listIssueDependencies(a: HubAccount, repo: string, number: number, direction: "blocked_by" | "blocking", page = 1): Promise<Page<GithubIssue>> {
  return list(a, `${issuePath(a, repo, number)}/dependencies/${direction}`, page);
}
export function addIssueDependency(a: HubAccount, repo: string, number: number, blockingIssueId: number): Promise<unknown> {
  return hubApi(a, "POST", `${issuePath(a, repo, number)}/dependencies/blocked_by`, { issue_id: positive(blockingIssueId, "blocking issue ID") });
}
export function removeIssueDependency(a: HubAccount, repo: string, number: number, blockingIssueId: number): Promise<unknown> {
  return hubApi(a, "DELETE", `${issuePath(a, repo, number)}/dependencies/blocked_by/${positive(blockingIssueId, "blocking issue ID")}`);
}

export type ReviewThread = {
  id: string; isResolved: boolean; isOutdated: boolean; path: string;
  line: number | null; startLine: number | null; diffSide: "LEFT" | "RIGHT";
  startDiffSide?: "LEFT" | "RIGHT" | null;
  originalLine?: number | null; originalStartLine?: number | null;
  comments: { nodes: { id: string; body: string; url: string; createdAt: string; author: { login: string } | null }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
};
export async function listReviewThreads(a: HubAccount, repo: string, number: number, cursor: string | null = null): Promise<{ items: ReviewThread[]; hasMore: boolean; cursor: string | null }> {
  repoPath(a, repo); positive(number, "pull request number");
  const [owner, name] = repo.split("/");
  const data = await gql<{ repository: { pullRequest: { reviewThreads: { nodes: ReviewThread[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null } | null }>(a, `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $name) { pullRequest(number: $number) {
      reviewThreads(first: 50, after: $cursor) { nodes {
        id isResolved isOutdated path line startLine diffSide startDiffSide originalLine originalStartLine
        comments(first: 100) { nodes { id body url createdAt author { login } } pageInfo { hasNextPage endCursor } }
      } pageInfo { hasNextPage endCursor } }
    } }
  }`, { owner, name, number, cursor });
  const connection = data.repository?.pullRequest?.reviewThreads;
  if (!connection) throw new Error("Review threads are unavailable.");
  return { items: connection.nodes, hasMore: connection.pageInfo.hasNextPage, cursor: connection.pageInfo.endCursor };
}

export type RangeReviewComment = { path: string; body: string; line: number; side: "LEFT" | "RIGHT"; start_line?: number; start_side?: "LEFT" | "RIGHT" };
export function submitRangeReview(a: HubAccount, repo: string, number: number, commitId: string, event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES", body: string, comments: RangeReviewComment[]): Promise<unknown> {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(commitId)) throw new Error("Review requires a pinned commit ID.");
  for (const comment of comments) {
    nonempty(comment.body, "Review comment"); nonempty(comment.path, "Review path"); positive(comment.line, "Review line");
    if (comment.start_line !== undefined) {
      positive(comment.start_line, "Review start line");
      if (comment.start_line >= comment.line || !comment.start_side) throw new Error("Invalid multiline review range.");
    }
  }
  return hubApi(a, "POST", `${pullPath(a, repo, number)}/reviews`, { commit_id: commitId, event, body, comments });
}

export type LinkedIssue = { id: string; number: number; title: string; url: string; state: string; repository: { nameWithOwner: string } };
export async function listLinkedIssues(a: HubAccount, repo: string, number: number, cursor: string | null = null): Promise<{ items: LinkedIssue[]; hasMore: boolean; cursor: string | null }> {
  repoPath(a, repo); positive(number, "pull request number");
  const [owner, name] = repo.split("/");
  const data = await gql<{ repository: { pullRequest: { closingIssuesReferences: { nodes: LinkedIssue[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null } | null }>(a, `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $name) { pullRequest(number: $number) {
      closingIssuesReferences(first: 50, after: $cursor) { nodes { id number title url state repository { nameWithOwner } } pageInfo { hasNextPage endCursor } }
    } }
  }`, { owner, name, number, cursor });
  const connection = data.repository?.pullRequest?.closingIssuesReferences;
  if (!connection) throw new Error("Linked issues are unavailable.");
  return { items: connection.nodes, hasMore: connection.pageInfo.hasNextPage, cursor: connection.pageInfo.endCursor };
}

export type ProjectItem = { id: string; project: { id: string; title: string; url: string }; fieldValues: { nodes: { field?: { id: string; name: string }; name?: string; optionId?: string; text?: string; number?: number; date?: string }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
export async function listSubjectProjects(a: HubAccount, subjectNodeId: string, cursor: string | null = null): Promise<{ items: ProjectItem[]; hasMore: boolean; cursor: string | null }> {
  github(a); nonempty(subjectNodeId, "Subject node ID");
  const data = await gql<{ node: { projectItems?: { nodes: ProjectItem[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null }>(a, `query($id: ID!, $cursor: String) {
    node(id: $id) {
      ... on Issue { projectItems(first: 50, after: $cursor) { ...Items } }
      ... on PullRequest { projectItems(first: 50, after: $cursor) { ...Items } }
    }
  }
  fragment Items on ProjectV2ItemConnection { nodes { id project { id title url }
    fieldValues(first: 100) { nodes {
      ... on ProjectV2ItemFieldSingleSelectValue { name optionId field { ... on ProjectV2SingleSelectField { id name } } }
      ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { id name } } }
      ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2Field { id name } } }
      ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2Field { id name } } }
    } pageInfo { hasNextPage endCursor } }
  } pageInfo { hasNextPage endCursor } }`, { id: subjectNodeId, cursor });
  const connection = data.node?.projectItems;
  if (!connection) throw new Error("Project fields are unavailable or the account lacks project access.");
  return { items: connection.nodes, hasMore: connection.pageInfo.hasNextPage, cursor: connection.pageInfo.endCursor };
}
export type ProjectFieldValue = { singleSelectOptionId: string } | { text: string } | { number: number } | { date: string };
export type ProjectField = { id: string; name: string; dataType: string; options?: { id: string; name: string; color: string; description: string }[] };
export async function listProjectFields(a: HubAccount, projectId: string, cursor: string | null = null): Promise<{ items: ProjectField[]; hasMore: boolean; cursor: string | null }> {
  github(a); nonempty(projectId, "Project node ID");
  const data = await gql<{ node: { fields?: { nodes: ProjectField[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null }>(a, `query($id: ID!, $cursor: String) {
    node(id: $id) { ... on ProjectV2 { fields(first: 100, after: $cursor) { nodes {
      ... on ProjectV2Field { id name dataType }
      ... on ProjectV2SingleSelectField { id name dataType options { id name color description } }
      ... on ProjectV2IterationField { id name dataType }
    } pageInfo { hasNextPage endCursor } } } }
  }`, { id: projectId, cursor });
  const connection = data.node?.fields;
  if (!connection) throw new Error("Project field options are unavailable.");
  return { items: connection.nodes, hasMore: connection.pageInfo.hasNextPage, cursor: connection.pageInfo.endCursor };
}
export async function updateProjectField(a: HubAccount, projectId: string, itemId: string, fieldId: string, value: ProjectFieldValue | null): Promise<void> {
  github(a);
  for (const id of [projectId, itemId, fieldId]) nonempty(id, "Project field ID");
  if (value === null) {
    await mutation(a, "mutation($project: ID!, $item: ID!, $field: ID!) { clearProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $field}) { projectV2Item { id } } }", { project: projectId, item: itemId, field: fieldId }, "clearProjectV2ItemFieldValue");
  } else {
    if ("number" in value && !Number.isFinite(value.number)) throw new Error("Invalid numeric project value.");
    await mutation(a, "mutation($project: ID!, $item: ID!, $field: ID!, $value: ProjectV2FieldValue!) { updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $field, value: $value}) { projectV2Item { id } } }", { project: projectId, item: itemId, field: fieldId, value }, "updateProjectV2ItemFieldValue");
  }
}

export type DecisionPull = { number: number; title: string; body: string | null; html_url: string; state: string; merged_at: string | null };
export function listCommitPulls(a: HubAccount, repo: string, sha: string, page = 1): Promise<Page<DecisionPull>> {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(sha)) throw new Error("Decision history requires a full commit ID.");
  return list(a, `${repoPath(a, repo)}/commits/${sha}/pulls`, page);
}

export async function markNotificationsRead(a: HubAccount, ids: string[]): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  github(a);
  const succeeded: string[] = [], failed: { id: string; error: string }[] = [];
  // Sequential writes avoid triggering GitHub's secondary mutation rate limits.
  for (const id of [...new Set(ids)]) {
    if (!/^[0-9]+$/.test(id)) { failed.push({ id, error: "Invalid notification ID" }); continue; }
    try { await hubApi(a, "PATCH", `/notifications/threads/${id}`); succeeded.push(id); }
    catch (error) { failed.push({ id, error: formatBackendError(error) }); }
  }
  return { succeeded, failed };
}

export function permanentCodeLink(a: HubAccount, repo: string, sha: string, path: string, start?: number, end?: number): string {
  repoPath(a, repo);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(sha)) throw new Error("A full commit ID is required for a permanent link.");
  if (!path || path.split("/").some(p => !p || p === "." || p === "..")) throw new Error("Invalid file path.");
  if (end !== undefined && start === undefined) throw new Error("A range needs a starting line.");
  const fragment = start === undefined ? "" : `#L${positive(start, "start line")}${end === undefined ? "" : `-L${positive(end, "end line")}`}`;
  if (start !== undefined && end !== undefined && end < start) throw new Error("Invalid line range.");
  return `https://${a.host}/${repo.split("/").map(enc).join("/")}/blob/${sha}/${path.split("/").map(enc).join("/")}${fragment}`;
}

export function parseGithubSubjectUrl(raw: string, accounts: HubAccount[]): { account: HubAccount; repo: string; kind: "issue" | "pull"; number: number } | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const account = accounts.find(a => a.provider === "github" && a.host.toLowerCase() === url.hostname.toLowerCase());
  const match = /^\/([^/]+)\/([^/]+)\/(issues|pull)\/([1-9][0-9]*)\/?$/.exec(url.pathname);
  if (!account || !match) return null;
  let repo: string;
  try { repo = `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`; repoPath(account, repo); } catch { return null; }
  const number = Number(match[4]);
  if (!Number.isSafeInteger(number)) return null;
  return { account, repo, kind: match[3] === "pull" ? "pull" : "issue", number };
}
