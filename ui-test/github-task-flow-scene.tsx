import { useState } from "react";
import { IssueCreateDialog } from "@/components/repo/github/issue-create-dialog";
import { IssueDetailSheet } from "@/components/repo/github/issue-detail-sheet";
import { PrReviewWorktree } from "@/components/repo/github/pr-review-worktree";
import { CheckReminderBar } from "@/components/repo/github/check-reminder-bar";
import { ConflictRadarTool } from "@/components/repo/workbench/run-tools";
import { Toaster } from "@/components/ui/sonner";
import { useChangeWorkflow } from "@/lib/change-workflow/store";
import { subjectKey, useGithubWorkspace } from "@/lib/github-expansion/store";
import { useCheckReminderPoller, type PrCheckRow } from "@/lib/github-ui/check-reminders";
import { useReviewTaskStore } from "@/lib/github-ui/review-task-store";
import { useHubStore } from "@/lib/hub/store";
import type { HubAccount } from "@/lib/hub/types";
import { useNotificationPermission } from "@/lib/notifications";
import { useRepoStore } from "@/lib/repo-store";

/**
 * Real task/workspace/project/form/reminder components over a scripted local provider (no network, no tokens).
 * Playwright reads `window.__ghtf.calls` (every IPC command + args) and mutates `window.__ghtf.data`.
 * Native notifications go to the notification stub, which forwards to `window.__ghtf.notifications`.
 */
type Call = { cmd: string; args: Record<string, unknown> };
type Ghtf = { calls: Call[]; data: Record<string, unknown>; notifications: unknown[]; confirms: string[] };
declare global { interface Window { __ghtf: Ghtf; __ghtfInit?: Record<string, unknown>; __L8GIT_TEST_NOTIFY__?: (o: unknown) => void } }

export const REPO = "/tmp/ghtf-repo";
const ACCOUNT: HubAccount = { host: "github.com", provider: "github", login: "leon", name: null, avatar_url: null };
const BASE_SHA = "1".repeat(40), H0 = "2".repeat(40), H1 = "3".repeat(40);
const ok = <T,>(data: T) => ({ status: 200, data });
const file = (text: string) => ({ type: "file", encoding: "base64", content: btoa(text), sha: "s", size: text.length });
const user = (login: string) => ({ login, id: 1, avatar_url: "", html_url: "" });

const BUG_FORM = `name: Bug report
description: Something is broken
title: "[Bug] "
labels: [bug, triage]
assignees: [leon]
body:
  - type: input
    id: version
    attributes:
      label: Version
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps
`;
const FEATURE_MD = `---
name: Feature request
about: Suggest an idea
title: "[Feature] "
labels: enhancement, ui
assignees: octo
---
## Idea
`;
const BROKEN_FORM = "name: Broken\ndescription: x\nbody:\n  - type: slider\n    id: s\n    attributes:\n      label: S\n";

const issue = {
  id: 4200, node_id: "I_42", number: 42, title: "Crash on save", body: "Steps: save twice.", state: "open", state_reason: null,
  html_url: "https://github.com/o/r/issues/42", user: user("octo"), labels: [], assignees: [], milestone: null, comments: 2,
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z",
};
const comments = [
  { id: 1, body: "First comment: unrelated chatter", user: user("alice"), created_at: "2026-11-01T11:00:00Z", updated_at: "2026-11-01T11:00:00Z", html_url: "https://github.com/o/r/issues/42#c1" },
  { id: 2, body: "Repro: stack trace in writer.ts", user: user("bob"), created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z", html_url: "https://github.com/o/r/issues/42#c2" },
];
const projectItem = {
  id: "PVTI_1", project: { id: "PVT_1", title: "Roadmap", url: "https://github.com/orgs/o/projects/1" },
  fieldValues: { nodes: [
    { name: "Todo", optionId: "opt_todo_8f2", field: { id: "F_STATUS", name: "Status" } },
    { text: "keep", field: { id: "F_NOTE", name: "Note" } },
    {},
  ] },
};
const projectFields = [
  { id: "F_STATUS", name: "Status", dataType: "SINGLE_SELECT", options: [{ id: "opt_todo_8f2", name: "Todo", color: "GRAY", description: "" }, { id: "opt_done_c41", name: "Done", color: "GREEN", description: "" }] },
  { id: "F_NOTE", name: "Note", dataType: "TEXT" },
  { id: "F_SPRINT", name: "Sprint", dataType: "ITERATION" },
];

function hubApi(args: Record<string, unknown>, data: Record<string, unknown>): unknown {
  const p = String(args.path), method = String(args.method);
  if (p === "/graphql") {
    const q = String((args.body as { query: string }).query);
    if (q.includes("updateProjectV2ItemFieldValue")) return ok({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "PVTI_1" } } } });
    if (q.includes("projectItems")) return ok({ data: { node: { projectItems: { nodes: [projectItem], pageInfo: { hasNextPage: false, endCursor: null } } } } });
    if (q.includes("fields(first")) {
      if (data.fieldsDenied) throw "github.com 403: Resource not accessible by integration";
      return ok({ data: { node: { fields: { nodes: projectFields, pageInfo: { hasNextPage: false, endCursor: null } } } } });
    }
    return ok({ data: {} });
  }
  if (p === "/repos/o/r/contents/.github/ISSUE_TEMPLATE") {
    if (data.templates === "missing") throw "github.com 404: Not Found";
    if (data.templates === "denied") throw "github.com 403: Resource not accessible by integration";
    return ok(["bug.yml", "feature.md", "broken.yml", "config.yml"].map((name) => ({ name, path: `.github/ISSUE_TEMPLATE/${name}`, sha: name, type: "file" })));
  }
  const tpl = /^\/repos\/o\/r\/contents\/\.github\/ISSUE_TEMPLATE\/(.+)$/.exec(p);
  if (tpl) return ok(file(({ "bug.yml": BUG_FORM, "feature.md": FEATURE_MD, "broken.yml": BROKEN_FORM } as Record<string, string>)[tpl[1]]));
  if (p === "/repos/o/r/issues" && method === "POST") return ok({ ...issue, number: 77, html_url: "https://github.com/o/r/issues/77" });
  if (p === "/repos/o/r/issues/42") return ok(issue);
  if (p.startsWith("/repos/o/r/issues/42/comments")) return ok(comments);
  if (/\/issues\/42\/(sub_issues|dependencies)/.test(p)) return ok([]);
  return ok({});
}

function provider(cmd: string, args: Record<string, unknown>, data: Record<string, unknown>): unknown {
  if (cmd === "hub_api") return hubApi(args, data);
  if (cmd === "list_git_remotes") return args.path === REPO ? [{ name: "origin", url: "https://github.com/o/r.git" }] : [];
  if (cmd === "git_resolve_commit") return BASE_SHA;
  if (cmd === "hub_task_worktree") return { path: args.worktreePath, branch: args.branch, head: args.expectedHeadSha, source_pr: args.prNumber, cleanup_warning: data.cleanupWarning ?? null };
  if (cmd === "pr_checks") return data.checks;
  if (cmd === "git_expansion") {
    const req = args.request as { op: string };
    if (req.op === "overlap") return data.overlap;
    if (req.op === "integration") return data.integration;
  }
  return null;
}

function install(scene: string) {
  const g: Ghtf = { calls: [], data: { ...window.__ghtfInit }, notifications: [], confirms: [] };
  window.__ghtf = g;
  window.__L8GIT_TEST_INVOKE__ = async (cmd: string, raw?: Record<string, unknown>) => {
    const args = raw ?? {};
    g.calls.push({ cmd, args: structuredClone(args) });
    return provider(cmd, args, g.data);
  };
  window.__L8GIT_TEST_NOTIFY__ = (o) => g.notifications.push(o);
  // Record every confirm; the test decides the answer via data.confirm (default: cancel, so nothing is sent).
  window.confirm = (msg?: string) => { g.confirms.push(String(msg)); return g.data.confirm === true; };
  useHubStore.setState({ accounts: [ACCOUNT], activeKey: "leon@github.com" });
  useRepoStore.setState({ repos: { [REPO]: {} as never } });
  if (scene === "ghtf-reminder") {
    // The app window is in the background and the user already granted notifications (stubbed, never native).
    document.hasFocus = () => false;
    useNotificationPermission.setState({ status: "granted" });
  }
  if (scene === "ghtf-resume") seedResume();
}

/** A PR review workspace created earlier at H0, with recorded evidence, a review snapshot and local task marks. */
function seedResume() {
  const key = subjectKey(ACCOUNT, "o/r", "pull", 7);
  const wt = `${REPO}.worktrees/review-pr-7-${H0.slice(0, 10)}`;
  const branch = `review/pr-7-${H0.slice(0, 10)}`;
  const snap = { baseSha: BASE_SHA, headSha: H0, worktreeFingerprint: "fp" };
  const check = (id: string, command: string, outcome: "passed" | "failed") => ({ id, command, outcome, startedAt: "2026-11-02T09:00:00Z", finishedAt: "2026-11-02T09:01:00Z", outputSummary: "", snapshot: snap });
  useGithubWorkspace.setState({
    subjects: { [key]: { workspace: { repoPath: REPO, worktreePath: wt, branch, head: H0, context: "Review PR #7 saved context", linkedAt: 1 } } },
    reviews: { [key]: { head: H0, files: { "src/a.ts": "fa", "src/b.ts": "fb" }, reviewedAt: 1 } },
    branchContexts: { [JSON.stringify([wt, branch])]: { panel: "changes", file: "src/a.ts" } },
  });
  useChangeWorkflow.setState({ evidence: {
    old: { id: "old", scope: "s", sessionId: wt, task: "older run", recordedAt: "2026-11-01T09:00:00Z", snapshot: snap, files: [], checks: [check("o1", "bun old", "failed")], openIssues: ["stale issue"] },
    latest: { id: "latest", scope: "s", sessionId: wt, task: "fix review notes", recordedAt: "2026-11-02T09:00:00Z", snapshot: snap, files: ["src/a.ts"], checks: [check("c1", "bun test", "passed"), check("c2", "bun lint", "failed")], openIssues: ["null check in writer.ts"] },
    other: { id: "other", scope: "s", sessionId: "/elsewhere", task: "other worktree", recordedAt: "2026-11-03T09:00:00Z", snapshot: snap, files: [], checks: [], openIssues: ["not mine"] },
  } });
  useReviewTaskStore.setState({ done: { [key]: { t1: 1, t2: 2, t3: 3 } } });
}

function Poller() {
  useCheckReminderPoller();
  return null;
}

function ReminderScene() {
  const [checks, setChecks] = useState(() => window.__ghtf.data.checks as PrCheckRow[]);
  return (
    <>
      <button type="button" onClick={() => setChecks(window.__ghtf.data.checks as PrCheckRow[])}>Reload checks</button>
      <CheckReminderBar path={REPO} number={7} checks={checks} />
      <Poller />
    </>
  );
}

function CreateScene() {
  const [open, setOpen] = useState(true);
  const [created, setCreated] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open create dialog</button>
      <output aria-label="Created count">{created}</output>
      <IssueCreateDialog account={ACCOUNT} fullName="o/r" open={open} onOpenChange={setOpen} onCreated={() => setCreated((n) => n + 1)} />
    </>
  );
}

export default function GithubTaskFlowScene({ scene }: { scene: string }) {
  useState(() => { install(scene); return true; });
  const body =
    scene === "ghtf-create" ? <CreateScene />
    : scene === "ghtf-issue" ? <IssueDetailSheet account={ACCOUNT} fullName="o/r" number={42} onClose={() => {}} onChanged={() => {}} />
    : scene === "ghtf-review" ? <PrReviewWorktree path={REPO} number={7} headSha={H0} />
    : scene === "ghtf-resume" ? <PrReviewWorktree path={REPO} number={7} headSha={H1} />
    : scene === "ghtf-reminder" ? <ReminderScene />
    : <ConflictRadarTool path={REPO} initialHeads={["feature/a", "feature/b"]} />;
  return <div className="h-screen overflow-auto p-4">{body}<Toaster /></div>;
}
