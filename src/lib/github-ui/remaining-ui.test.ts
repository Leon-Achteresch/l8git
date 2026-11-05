import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/lib/platform/ipc", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@/lib/hub/api", () => ({ enc: encodeURIComponent, hubApi: vi.fn(), gql: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/hub/store", () => ({
  hubRepoPath: (a: { login: string; host: string }, f: string) => `hub:${a.login}@${a.host}/${f}`,
  useHubStore: { getState: () => ({ accounts: [] }) },
}));

import { hubApi } from "@/lib/hub/api";
import type { HubAccount, HubNotification } from "@/lib/hub/types";
import type { AgentEvidence } from "@/lib/change-workflow/model";
import type { GithubComment, GithubIssue, ProjectField, ProjectItem } from "@/lib/github-expansion/api";
import { branchContextKey, subjectKey, useGithubWorkspace, type CheckReminder } from "@/lib/github-expansion/store";
import { createIssueWorkspace, createReviewWorkspace } from "@/lib/github-expansion/workspace";
import { groupInbox, returnSummary } from "./inbox-model";
import { inboxVisitKey } from "./inbox-visit";
import { loadTemplateEntries, templatePrefill } from "./issue-forms-ui";
import { loadAllProjectFields, projectFieldRows } from "./project-fields";
import { pollReminders, reminderId, reminderTarget, type PrCheckRow } from "./check-reminders";
import { draftIssueContext, resumePrompt, resumeState } from "./workspace-resume";
import { radarRequest, worktreeOverlapRows } from "./worktree-radar";
import { reviewBranchName } from "@/components/repo/github/pr-review-worktree";

const a: HubAccount = { provider: "github", host: "github.com", login: "Alice", name: null, avatar_url: null };
const SHA = "a".repeat(40), SHA2 = "b".repeat(40);
const issue = { id: 1, node_id: "I_1", number: 7, title: "Fix it", body: "Body", html_url: "https://github.com/o/r/issues/7", state: "open", labels: [], assignees: [], user: null, comments: 2, updated_at: "", created_at: "" } as unknown as GithubIssue;
const comment = (id: number, body: string): GithubComment => ({ id, body, user: { login: `u${id}` } as GithubComment["user"], created_at: "", updated_at: "", html_url: `c${id}` });

beforeEach(() => {
  invoke.mockReset();
  useGithubWorkspace.setState({ subjects: {}, reminders: {}, reviews: {}, branchContexts: {} });
});

describe("3/8 canonical workspaces", () => {
  it("review worktree (incl. fork PRs) sends PR number, pinned head and explicit consent; refuses without consent", async () => {
    invoke.mockResolvedValue({ path: "/w/review", branch: reviewBranchName(12, SHA), head: SHA, source_pr: 12, cleanup_warning: "temp ref left" });
    const sel = { repoPath: "/r", worktreePath: "/w/review", branch: reviewBranchName(12, SHA), expectedHeadSha: SHA };
    await expect(createReviewWorkspace(a, "o/r", 12, sel, false)).rejects.toThrow(/Confirm/);
    expect(invoke).not.toHaveBeenCalled();
    const r = await createReviewWorkspace(a, "o/r", 12, sel, true);
    expect(invoke).toHaveBeenCalledWith("hub_task_worktree", expect.objectContaining({ path: "/r", expectedFullName: "o/r", worktreePath: "/w/review", branch: "review/pr-12-aaaaaaaaaa", expectedHeadSha: SHA, prNumber: 12, allowExternalCode: true }));
    expect(r.cleanup_warning).toBe("temp ref left");
    expect(useGithubWorkspace.getState().subjects[subjectKey(a, "o/r", "pull", 12)].workspace).toMatchObject({ worktreePath: "/w/review", head: SHA });
  });
  it("issue worktree never allows external code and links selected comments only", async () => {
    invoke.mockResolvedValue({ path: "/w/7", branch: "7-fix-it", head: SHA, source_pr: null, cleanup_warning: null });
    const cs = [comment(1, "keep me"), comment(2, "skip me")];
    await createIssueWorkspace(a, "o/r", issue, { repoPath: "/r", worktreePath: "/w/7", branch: "7-fix-it", expectedHeadSha: SHA }, cs.filter((c) => c.id === 1));
    expect(invoke.mock.calls[0][1]).toMatchObject({ prNumber: null, allowExternalCode: false, expectedHeadSha: SHA });
    const ctx = useGithubWorkspace.getState().subjects[subjectKey(a, "o/r", "issue", 7)].workspace!.context;
    expect(ctx).toContain("keep me");
    expect(ctx).not.toContain("skip me");
    expect(draftIssueContext(issue, cs, new Set([2]))).toContain("skip me");
    await expect(createIssueWorkspace(a, "o/r", issue, { repoPath: "/r", worktreePath: "/w/7", branch: "x", expectedHeadSha: "HEAD" })).rejects.toThrow(/pinned/);
  });
});

describe("26 issue templates", () => {
  it("loads YAML forms and Markdown front-matter, keeps broken files visible, and prefills on selection", async () => {
    const b64 = (s: string) => ({ type: "file", encoding: "base64", content: btoa(s), size: s.length });
    vi.mocked(hubApi).mockImplementation((async (_a: unknown, _m: unknown, url: string) => {
      if (/contents\/\.github\/ISSUE_TEMPLATE\?|contents\/\.github\/ISSUE_TEMPLATE$/.test(url)) {
        return [
          { name: "bug.md", path: ".github/ISSUE_TEMPLATE/bug.md", sha: "1", type: "file" },
          { name: "broken.yml", path: ".github/ISSUE_TEMPLATE/broken.yml", sha: "2", type: "file" },
          { name: "feature.yml", path: ".github/ISSUE_TEMPLATE/feature.yml", sha: "4", type: "file" },
          { name: "config.yml", path: ".github/ISSUE_TEMPLATE/config.yml", sha: "3", type: "file" },
        ];
      }
      if (url.includes("bug.md")) return b64("---\nname: Bug\nabout: Report\ntitle: '[bug] '\nlabels: bug, triage\nassignees:\n  - bob\n---\n## Steps\n");
      if (url.includes("feature.yml")) return b64("name: Feature\ndescription: Ask\ntitle: '[feat] '\nlabels: [enhancement]\nbody:\n  - type: input\n    id: what\n    attributes:\n      label: What\n    validations:\n      required: true\n");
      if (url.includes("broken.yml")) return b64("name: Broken\nbody: nope\n");
      throw new Error("unexpected " + url);
    }) as never);
    const entries = await loadTemplateEntries(a, "o/r");
    expect(entries.map((e) => e.name)).toEqual(["bug.md", "broken.yml", "feature.yml"]);
    expect(entries[1].loaded).toBeNull();
    expect(entries[2].loaded?.kind).toBe("form");
    expect(templatePrefill(entries[2], "", "")).toEqual({ title: "[feat] ", body: "", labels: ["enhancement"], assignees: [] });
    const md = templatePrefill(entries[0], "", "");
    expect(md).toEqual({ title: "[bug] ", body: "## Steps\n", labels: ["bug", "triage"], assignees: ["bob"] });
    // Caller-supplied title/body (issue from diff) are kept; template body is prepended.
    expect(templatePrefill(entries[0], "Mine", "ctx")).toMatchObject({ title: "Mine", body: "## Steps\n\nctx" });
    expect(templatePrefill(null, "t", "b")).toEqual({ title: "t", body: "b", labels: [], assignees: [] });
  });
  it("404 means no templates, but a permission error is surfaced", async () => {
    vi.mocked(hubApi).mockRejectedValueOnce(new Error("github.com 404: Not Found"));
    await expect(loadTemplateEntries(a, "o/r")).resolves.toEqual([]);
    vi.mocked(hubApi).mockRejectedValueOnce(new Error("github.com 403: Resource not accessible"));
    await expect(loadTemplateEntries(a, "o/r")).rejects.toThrow(/403/);
  });
});

describe("28 project fields", () => {
  const item: ProjectItem = { id: "PVTI", project: { id: "P", title: "Board", url: "u" }, fieldValues: { nodes: [
    { field: { id: "F_status", name: "Status" }, name: "Todo", optionId: "opt_todo" },
    { field: { id: "F_est", name: "Estimate" }, number: 3 },
  ], pageInfo: { hasNextPage: false, endCursor: null } } };
  it("paginates definitions and exposes real single-select option IDs; iteration stays read-only", async () => {
    const pages: Record<string, { items: ProjectField[]; hasMore: boolean; cursor: string | null }> = {
      start: { items: [{ id: "F_status", name: "Status", dataType: "SINGLE_SELECT", options: [{ id: "opt_todo", name: "Todo", color: "", description: "" }, { id: "opt_done", name: "Done", color: "", description: "" }] }], hasMore: true, cursor: "c1" },
      c1: { items: [{ id: "F_est", name: "Estimate", dataType: "NUMBER" }, { id: "F_it", name: "Sprint", dataType: "ITERATION" }, { id: "F_title", name: "Title", dataType: "TITLE" }], hasMore: false, cursor: null },
    };
    const list = vi.fn(async (_a: HubAccount, _p: string, cursor?: string | null) => pages[cursor ?? "start"]);
    const fields = await loadAllProjectFields(a, "P", list);
    expect(list).toHaveBeenCalledTimes(2);
    const rows = projectFieldRows(item, fields);
    expect(rows.find((r) => r.name === "Status")).toMatchObject({ kind: "single_select", optionId: "opt_todo", options: [{ id: "opt_todo", name: "Todo" }, { id: "opt_done", name: "Done" }] });
    expect(rows.find((r) => r.name === "Estimate")).toMatchObject({ kind: "number", value: "3" });
    expect(rows.some((r) => r.name === "Sprint" || r.name === "Title")).toBe(false);
    // Without definitions (no permission), number editing survives and the select is read-only.
    expect(projectFieldRows(item, null).map((r) => r.kind)).toEqual(["unsupported", "number"]);
  });
});

describe("38 check reminders", () => {
  const subject = subjectKey(a, "o/r", "pull", 5);
  const add = (r: Omit<CheckReminder, "subject" | "deliveredAt">) => {
    const full = { ...r, subject, deliveredAt: null };
    useGithubWorkspace.getState().saveReminder(reminderId(full), full);
    return reminderId(full);
  };
  it("never fires for another head, waits for every duplicate run, and notifies at most once", async () => {
    const id = add({ headSha: SHA, checkName: "ci", when: "success" });
    const send = vi.fn(async () => true);
    let rows: PrCheckRow[] = [{ name: "ci", status: "completed", conclusion: "success", head_sha: SHA2 }];
    const fetch = vi.fn(async () => rows);
    await pollReminders(fetch, [a], send);
    expect(fetch).toHaveBeenCalledWith(a, "o/r", 5);
    expect(send).not.toHaveBeenCalled();
    rows = [{ name: "ci", status: "completed", conclusion: "success", head_sha: SHA }, { name: "ci", status: "in_progress", conclusion: null, head_sha: SHA }];
    await pollReminders(fetch, [a], send);
    expect(send).not.toHaveBeenCalled();
    rows = [{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS", head_sha: SHA }, { name: "ci", status: "completed", conclusion: "success", head_sha: SHA }];
    await Promise.all([pollReminders(fetch, [a], send), pollReminders(fetch, [a], send)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(useGithubWorkspace.getState().reminders[id].deliveredAt).not.toBeNull();
    await pollReminders(fetch, [a], send);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("is account-scoped: no matching connected account → no poll", async () => {
    add({ headSha: SHA, checkName: "ci", when: "completed" });
    const fetch = vi.fn(async () => []);
    await pollReminders(fetch, [{ ...a, login: "bob" }], vi.fn());
    expect(fetch).not.toHaveBeenCalled();
    expect(reminderTarget(subject, [{ ...a, login: "ALICE", host: "GitHub.com" }])?.number).toBe(5);
  });
});

describe("35/37 inbox via canonical events", () => {
  const n = (id: string, reason: string, updatedAt: string, url: string): HubNotification => ({ id, title: id, repo: "o/r", type: "PullRequest", reason, unread: true, updatedAt, url });
  const list = [n("1", "comment", "2026-01-02T00:00:00Z", "A"), n("1", "comment", "2026-01-01T00:00:00Z", "A"), n("2", "review_requested", "2026-01-03T00:00:00Z", "A"), n("3", "author", "2026-01-01T00:00:00Z", "B")];
  it("dedupes a repeated thread id, keeps distinct events and kinds", () => {
    const g = groupInbox(list, (x) => x.url!, {}, null).find((x) => x.key === "A")!;
    expect(g.items.map((i) => i.id)).toEqual(["2", "1"]);
    expect(g.kinds).toEqual(["review_requested", "comment"]);
  });
  it("first visit has no digest; later visits summarize only newer events", () => {
    expect(returnSummary(list, (x) => x.url!, null)).toEqual([]);
    expect(groupInbox(list, (x) => x.url!, {}, null).some((g) => g.newSinceVisit)).toBe(false);
    const s = returnSummary(list, (x) => x.url!, Date.parse("2026-01-02T12:00:00Z"));
    expect(s.map((g) => [g.subject, g.events.length])).toEqual([["A", 1]]);
    expect(inboxVisitKey(a)).toBe(inboxVisitKey({ ...a, login: "alice", host: "GITHUB.com" }));
    expect(inboxVisitKey(a)).not.toBe(inboxVisitKey({ ...a, provider: "gitea" }));
  });
});

describe("31 resume context", () => {
  it("restores evidence/checks for that worktree, branch view and review progress", () => {
    const ws = { repoPath: "/r", worktreePath: "/w/7", branch: "7-fix", head: SHA, context: "Issue #7", linkedAt: 1 };
    const ev = (id: string, sessionId: string, recordedAt: string, outcome: "passed" | "failed"): AgentEvidence => ({
      id, scope: "s", sessionId, task: `task ${id}`, recordedAt, snapshot: { baseSha: SHA, headSha: SHA2, worktreeFingerprint: "f" }, files: [],
      checks: [{ id: "c", command: "bun test", outcome, startedAt: recordedAt, finishedAt: recordedAt, outputSummary: "", snapshot: { baseSha: SHA, headSha: SHA2, worktreeFingerprint: "f" } }], openIssues: ["flaky e2e"],
    });
    const state = resumeState({
      workspace: ws,
      evidence: { a: ev("old", "/w/7", "2026-01-01", "passed"), b: ev("new", "/w/7", "2026-01-02", "failed"), c: ev("other", "/w/9", "2026-01-03", "passed") },
      branchContexts: { [branchContextKey("/w/7", "7-fix")]: { panel: "changes", file: "src/a.ts" } },
      review: { head: SHA, reviewedAt: 1, files: { "a.ts": "x", "b.ts": "y" } },
      reviewTasksDone: { t1: 1 },
      currentHead: SHA2,
    });
    expect(state.evidence).toMatchObject({ task: "task new", failed: 1, passed: 0, openIssues: ["flaky e2e"] });
    expect(state.branchContext).toEqual({ panel: "changes", file: "src/a.ts" });
    expect(state.review).toMatchObject({ reviewedFiles: 2, headMoved: true });
    const prompt = resumePrompt(state);
    expect(prompt).toContain("failed: bun test");
    expect(prompt).toContain("flaky e2e");
    expect(prompt).toContain("PR head has moved");
    expect(resumeState({ workspace: ws, evidence: {}, branchContexts: {} })).toMatchObject({ evidence: null, branchContext: null, review: null, tasksDone: 0 });
  });
});

describe("70 radar pending-worktree overlaps", () => {
  it("requests worktree evidence and flags only uncommitted overlapping edits", () => {
    expect(radarRequest("main", ["a", "b"])).toEqual({ op: "overlap", base: "main", heads: ["a", "b"], includeWorktrees: true });
    const rows = worktreeOverlapRows({
      worktrees: [{ path: "/w1", head: SHA, branch: "x", files: ["f.ts", "g.ts"], pendingFiles: ["f.ts"] }, { path: "/w2", head: SHA2, branch: null, files: ["f.ts"], pendingFiles: [] }],
      worktreeOverlaps: [{ file: "f.ts", worktreePaths: ["/w1", "/w2", "/gone"] }],
    });
    expect(rows).toEqual([{ file: "f.ts", worktrees: [{ path: "/w1", pending: true }, { path: "/w2", pending: false }, { path: "/gone", pending: false }] }]);
  });
});
