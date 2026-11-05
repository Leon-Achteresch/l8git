import { useState } from "react";
import { PullRequestFilesTab } from "@/components/repo/pr/pull-request-files-tab";
import { Toaster } from "@/components/ui/sonner";
import { useHubStore } from "@/lib/hub/store";
import { usePrProviderStore } from "@/lib/pr-provider-store";
import { useRepoStore, type RepoInfo } from "@/lib/repo-store";

/**
 * IDs 17/18: real PR Files tab over a scripted GitHub provider. `window.__prr.calls` records requests,
 * `window.__prr.local` is the working-copy file content returned by `repo_read_file`.
 */
type Prr = { calls: { cmd: string; args: Record<string, unknown> }[]; local: Record<string, string>; branch: string };
declare global { interface Window { __prr: Prr } }

export const REPO = "/tmp/prr-repo";
const HEAD = "a".repeat(40), BASE = "c".repeat(40);
// old: a b c d e   new: a B c x d e
const PATCH_A = "@@ -1,5 +1,6 @@\n a\n-b\n+B\n c\n+x\n d\n e";
const PATCH_G = "@@ -1,2 +1,2 @@\n-one\n+ONE\n two";
const comment = (id: string, file: string, line: number, body: string) => ({ id, author: "rev", author_avatar: null, created_at: "2026-11-01T10:00:00Z", body, kind: "inline", file_path: file, line, thread_id: id });
const thread = (id: string, path: string, line: number, startLine: number | null, body: string, extra: Record<string, unknown> = {}) => ({
  id, isResolved: false, isOutdated: false, path, line, startLine, diffSide: "RIGHT",
  comments: { nodes: [{ id: `${id}c`, body, url: "", createdAt: "", author: { login: "rev" } }], pageInfo: { hasNextPage: false, endCursor: null } }, ...extra,
});

function provider(cmd: string, args: Record<string, unknown>): unknown {
  const g = window.__prr;
  if (cmd === "pr_capabilities" || cmd === "pr_provider_capabilities") return caps;
  if (cmd === "list_git_remotes") return [{ name: "origin", url: "https://github.com/o/r.git" }];
  if (cmd === "pr_files") return [
    { path: "src/a.ts", status: "modified", additions: 2, deletions: 1 },
    { path: "src/g.ts", previous_path: "src/old-g.ts", status: "renamed", additions: 1, deletions: 1 },
  ];
  if (cmd === "pr_file_patch") {
    // Pinned reads must name the reviewed head and base exactly.
    if ((args.expectedHeadSha !== undefined || args.expectedBaseSha !== undefined) && (args.expectedHeadSha !== HEAD || args.expectedBaseSha !== BASE)) throw new Error("pins mismatch");
    return args.file === "src/g.ts" ? PATCH_G : PATCH_A;
  }
  if (cmd === "git_resolve_commit") return new URLSearchParams(location.search).get("local") ?? HEAD;
  if (cmd === "pr_conversation") return { comments: [
    comment("101", "src/a.ts", 4, "range fix\n```suggestion\nB2\nc2\nx2\n```"),
    comment("102", "src/a.ts", 2, "```suggestion\nBB\n```"),
    comment("103", "src/g.ts", 1, "```suggestion\nUno\n```"),
    comment("104", "src/a.ts", 6, "```suggestion\nold\n```"),
  ] };
  if (cmd === "pr_review_threads") return ["101", "102", "103", "104"].map((c) => ({ id: `T${c}`, resolved: false, comment_ids: [c] }));
  if (cmd === "repo_read_file") return g.local[String(args.file)] ?? "";
  if (cmd === "hub_apply_suggestions") return null;
  if (cmd === "hub_api" && args.path === "/graphql") {
    const q = String((args.body as { query?: string })?.query ?? "");
    if (q.includes("reviewThreads")) return { status: 200, data: { data: { repository: { pullRequest: { reviewThreads: { nodes: [
      thread("T101", "src/a.ts", 4, 2, "range fix\n```suggestion\nB2\nc2\nx2\n```", { startDiffSide: "RIGHT" }),
      thread("T102", "src/a.ts", 2, null, "```suggestion\nBB\n```"),
      thread("T103", "src/g.ts", 1, null, "```suggestion\nUno\n```"),
      thread("T104", "src/a.ts", 6, null, "```suggestion\nold\n```", { isOutdated: true, line: null }),
    ], pageInfo: { hasNextPage: false, endCursor: null } } } } } } };
  }
  if (cmd === "hub_api") return { status: 404, data: { message: "Not Found" } };
  return null;
}

const caps = {
  provider: "github", label: "GitHub", host: "github.com", can_approve: true, can_request_changes: true, can_auto_merge: true, can_draft: true,
  can_delete_source_branch: true, can_rerun_checks: true, can_workflows: true, can_inline_comments: true, can_draft_reviews: true, can_resolve_threads: true,
  merge_strategies: ["merge"],
};

function install() {
  window.__prr = { calls: [], local: { "src/a.ts": "a\nB\nc\nx\nd\ne\n", "src/g.ts": "ONE\ntwo\n" }, branch: "feat" };
  window.__L8GIT_TEST_INVOKE__ = async (cmd: string, raw?: Record<string, unknown>) => {
    const args = raw ?? {};
    window.__prr.calls.push({ cmd, args });
    return provider(cmd, args);
  };
  localStorage.removeItem("l8git-pr-review-drafts");
  usePrProviderStore.setState((s) => ({ capsByPath: { ...s.capsByPath, [REPO]: caps } }));
  useHubStore.setState({ accounts: [{ host: "github.com", provider: "github", login: "leon", name: null, avatar_url: null }], activeKey: "leon@github.com" });
  const info = { path: REPO, branch: new URLSearchParams(location.search).get("branch") ?? "feat", commits: [], branches: [], tags: [] } as unknown as RepoInfo;
  useRepoStore.setState((s) => ({ repos: { ...s.repos, [REPO]: info } }));
}

export default function PrRangesScene() {
  useState(() => { install(); return true; });
  return (
    <div className="h-screen">
      <PullRequestFilesTab path={REPO} number={7} baseRef="main" headRef="feat" headSha={HEAD} baseSha={BASE} />
      <Toaster />
    </div>
  );
}
