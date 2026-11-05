import { useState } from "react";
import { GithubCiExtensions } from "@/components/repo/github-ci/github-ci-extensions";
import { ReviewNarrativePanel } from "@/components/repo/change-workflow/review-narrative-panel";
import { Toaster } from "@/components/ui/sonner";
import { SemanticDiffView } from "@/components/repo/github/semantic-diff";
import { useHubStore } from "@/lib/hub/store";
import { workflowScope } from "@/lib/change-workflow/model";
import { useChangeWorkflow } from "@/lib/change-workflow/store";
import { anchorFingerprint } from "@/lib/change-workflow-ui/anchors";

export const PATCH_A = "@@ -1,3 +1,4 @@\n a\n-b\n+B\n+C\n d";
export const PATCH_B = "@@ -1,3 +1,4 @@\n a\n-b\n+X\n+C\n d";

/**
 * Real GitHub CI / review-story components over a scripted provider. Playwright drives
 * `window.__ghfx`: `hold(pattern)` delays matching calls until `release(pattern)`,
 * `calls` records every request, `data` is the mutable provider state.
 */
type Call = { cmd: string; path?: string; args: Record<string, unknown> };
type Ghfx = { calls: Call[]; data: Record<string, unknown>; hold: (p: string) => void; release: (p: string) => void; held: Map<string, { promise: Promise<void>; open: () => void }> };
declare global { interface Window { __ghfx: Ghfx; __ghfxInit?: { holds?: string[]; data?: Record<string, unknown> } } }

const A = "a".repeat(40), B = "b".repeat(40), BASE = "c".repeat(40);
const run = (id: number, sha: string) => ({
  id, name: "CI", run_number: id, run_attempt: 1, workflow_id: 1, head_sha: sha, head_branch: "main", path: ".github/workflows/ci.yml",
  event: "push", status: "completed", conclusion: "failure", created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:05:00Z",
  html_url: `https://github.com/o/r/actions/runs/${id}`, display_title: `run ${id}`,
});
const job = (id: number, runId: number) => ({ id, run_id: runId, run_attempt: 1, name: `test-${runId}`, status: "completed", conclusion: "failure", steps: [], html_url: "", started_at: null, completed_at: null, head_sha: runId === 1 ? A : B, labels: [] });
const file = (text: string) => ({ type: "file", encoding: "base64", content: btoa(text), sha: "x", size: text.length });
const ok = <T,>(data: T) => ({ status: 200, data });

function provider(cmd: string, args: Record<string, unknown>, data: Record<string, unknown>): unknown {
  if (cmd === "list_git_remotes") return [{ name: "origin", url: "https://github.com/o/r.git" }];
  if (cmd === "hub_download") return { base64: btoa(`log of job ${args.id}\n##[error]boom`), content_type: "text/plain", file_name: "log.txt", size: 30 };
  if (cmd === "hub_task_worktree") return { path: args.worktreePath, branch: args.branch, head: args.expectedHeadSha, source_pr: null, cleanup_warning: null };
  if (cmd === "repo_file_content_at") return (data.files as Record<string, string>)[String(args.treeish)];
  if (cmd === "pr_files") return [{ path: "src/a.ts", status: "modified", additions: 2, deletions: 1 }];
  if (cmd === "pr_file_patch") {
    const patch = (data.patches as Record<string, string | undefined>)[`${args.expectedBaseSha}:${args.expectedHeadSha}`];
    if (patch === undefined) throw new Error("PR revisions changed during the patch read; refusing unpinned data");
    return patch;
  }
  if (cmd !== "hub_api") return null;
  const p = String(args.path);
  if (/\/actions\/runs\?/.test(p)) return ok({ total_count: 2, workflow_runs: [run(1, A), run(2, B)] });
  const jobs = /\/actions\/runs\/(\d+)\/attempts\/1\/jobs/.exec(p);
  if (jobs) return ok({ total_count: 1, jobs: [job(Number(jobs[1]) * 10, Number(jobs[1]))] });
  const arts = /\/actions\/runs\/(\d+)\/artifacts/.exec(p);
  if (arts) { const items = (data.artifacts as unknown[]) ?? []; return ok({ total_count: items.length, artifacts: items }); }
  if (/\/deployments\/\d+\/statuses/.test(p)) return ok(data.statuses ?? []);
  if (/\/deployments\?/.test(p)) return ok(data.deployments ?? []);
  if (/\/actions\/workflows\?/.test(p)) return ok({ total_count: 2, workflows: [
    { id: 11, name: "Deploy A", path: ".github/workflows/a.yml", state: "active", html_url: "" },
    { id: 12, name: "Deploy B", path: ".github/workflows/b.yml", state: "active", html_url: "" },
  ] });
  if (/\/contents\/\.github\/workflows\/a\.yml/.test(p)) return ok(file("on:\n  workflow_dispatch:\n    inputs:\n      alpha:\n        type: string\n        default: from-a\n"));
  if (/\/contents\/\.github\/workflows\/b\.yml/.test(p)) return ok(file("on:\n  workflow_dispatch:\n    inputs:\n      beta:\n        type: string\n        default: from-b\n"));
  if (/\/contents\/\.github\/workflows\/ci\.yml/.test(p)) return ok(file("name: CI\n"));
  if (/\/workflows\/\d+\/runs\?/.test(p)) return ok({ total_count: 0, workflow_runs: [] });
  if (/\/dispatches$/.test(p)) return ok({ workflow_run_id: 99, html_url: "https://github.com/o/r/actions/runs/99" });
  if (/\/environments/.test(p)) return ok({ environments: [] });
  if (/\/repos\/o\/r$/.test(p)) return ok({ default_branch: "main" });
  return ok({});
}

function install() {
  const held = new Map<string, { promise: Promise<void>; open: () => void }>();
  const g: Ghfx = {
    calls: [], data: { patches: {}, artifacts: [], deployments: [], statuses: [] }, held,
    hold: (pattern) => { let open = () => {}; const promise = new Promise<void>((r) => { open = r; }); held.set(pattern, { promise, open }); },
    release: (pattern) => { held.get(pattern)?.open(); held.delete(pattern); },
  };
  for (const pattern of window.__ghfxInit?.holds ?? []) g.hold(pattern);
  Object.assign(g.data, window.__ghfxInit?.data);
  window.__ghfx = g;
  window.__L8GIT_TEST_INVOKE__ = async (cmd: string, raw?: Record<string, unknown>) => {
    const args = raw ?? {};
    const key = `${cmd} ${JSON.stringify(args)}`;
    g.calls.push({ cmd, path: typeof args.path === "string" ? args.path : undefined, args });
    for (const [pattern, h] of [...held]) if (key.includes(pattern)) await h.promise;
    return provider(cmd, args, g.data);
  };
  // A story chapter anchored to head-side lines 2–3 of PATCH_A at base/head A.
  void anchorFingerprint(PATCH_A, "head", 2, 3).then((fp) => useChangeWorkflow.getState().saveNarrative({
    id: "pull:7", scope: workflowScope("github", "github.com", "leon", "o/r"), pullNumber: 7, title: "Story",
    chapters: [{ id: "c1", title: "Chapter one", explanation: "", anchors: [{ path: "src/a.ts", side: "head", startLine: 2, endLine: 3, baseSha: BASE, headSha: A, contentFingerprint: fp! }] }],
  }));
  useHubStore.setState({ accounts: [{ host: "github.com", provider: "github", login: "leon", name: null, avatar_url: null }], activeKey: "leon@github.com" });
}

export default function GithubFixesScene({ scene }: { scene: string }) {
  useState(() => { install(); return true; });
  const [head, setHead] = useState(A);
  if (scene === "ghfx-semantic") {
    return <div className="h-screen p-4"><SemanticDiffView path="/tmp/ghfx-repo" file="package-lock.json" base="base" head="head" kind="npm-lock" /></div>;
  }
  if (scene === "ghfx-story") {
    return (
      <div className="h-screen overflow-auto p-4">
        <button type="button" onClick={() => setHead(B)}>Switch to head B</button>
        <output aria-label="Current head">{head.slice(0, 4)}</output>
        <ReviewNarrativePanel path="/tmp/ghfx-repo" number={7} baseSha={BASE} headSha={head} />
      </div>
    );
  }
  return (
    <div className="h-screen p-4">
      <GithubCiExtensions path="/tmp/ghfx-repo" />
      <Toaster />
    </div>
  );
}
