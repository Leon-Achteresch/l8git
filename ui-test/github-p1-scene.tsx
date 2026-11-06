import { Profiler, useState } from "react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { MentionTextarea } from "@/components/repo/github/mention-textarea";
import { PullRequestInspectDetail } from "@/components/repo/pr/pull-request-inspect-detail";
import { EditRemoteDialog } from "@/components/repo/remote/edit-remote-dialog";
import { useHubStore } from "@/lib/hub/store";
import { isTarget, useGithubTarget } from "@/lib/github-ui/target";
import { usePrGithub } from "@/lib/github-ui/use-pr-github";
import { useRepoStore } from "@/lib/repo-store";

/**
 * Real mention / PR detail / remote dialog components over a scripted provider (FINAL-UI-REVIEW P1 1–3).
 * Playwright drives `window.__ghp1`: `hold(p)`/`release(p)` delay matching calls; with `data.gateRemotes`
 * every `list_git_remotes` result is captured at call time and only delivered by `releaseRemotes(urlPart)`.
 */
type Call = { cmd: string; args: Record<string, unknown> };
type Remote = { name: string; url: string };
type Gate = { result: Remote[]; open: () => void };
type Ghp1 = {
  calls: Call[]; data: Record<string, unknown>; gates: Gate[]; renders: number;
  hold: (p: string) => void; release: (p: string) => void; releaseRemotes: (urlPart: string) => void;
};
declare global { interface Window { __ghp1: Ghp1; __ghp1Init?: { holds?: string[]; data?: Record<string, unknown> } } }

export const P1_REPO = "/tmp/ghp1-repo", P1_REPO2 = "/tmp/ghp1-repo2";
const ok = <T,>(data: T) => ({ status: 200, data });
const nodeId = (login: string, repo: string, n: number) => `PR_${login}_${repo}_${n}`;

function provider(cmd: string, args: Record<string, unknown>, data: Record<string, unknown>): unknown {
  const remotes = data.remotes as Record<string, Remote[]>;
  if (cmd === "list_git_remotes") return remotes[String(args.path)] ?? [];
  if (cmd === "set_git_remote_url") {
    remotes[String(args.path)] = [{ name: String(args.name), url: String(args.url) }];
    return "updated";
  }
  if (cmd === "open_repo") return { path: args.path, branch: "main", commits: [], branches: [], tags: [] };
  if (cmd === "list_stashes") return [];
  if (cmd === "repo_full_status") return { entries: [], upstream_sync: { ahead: 0, behind: 0 }, has_upstream: false };
  if (cmd === "pr_detail") {
    // Like the backend: routed by the path's origin at call time. `o/b` has the opposite draft state.
    const n = Number(args.number);
    const repo = /github\.com\/(.+?)\.git$/.exec(remotes[String(args.path)]?.[0]?.url ?? "")?.[1] ?? "?";
    return {
      number: n, title: `PR ${n} in ${String(args.path)} (${repo})`, state: "open", is_draft: (n === 2) !== (repo === "o/b"), author: "leon", author_avatar: null,
      source_branch: `f${n}`, target_branch: "main", html_url: "", created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z",
      labels: [], reviewers: [], provider: "github", body_markdown: `Body of ${repo}#${n}`, mergeable: true, merge_commit_sha: null, head_sha: "a".repeat(40),
    };
  }
  if (cmd !== "hub_api") return null;
  const p = String(args.path);
  const login = String(args.login);
  if (p === "/graphql") {
    const body = args.body as { query: string; variables: { owner?: string; name?: string; number?: number; id?: string } };
    const v = body.variables;
    const m = /mutation[^{]*\{\s*(\w+)/.exec(body.query);
    if (m) return ok({ data: { [m[1]]: { pullRequest: { id: v.id }, mergeQueueEntry: { id: "q" }, clientMutationId: "x" } } });
    const repo = `${v.owner}/${v.name}`;
    if ((data.fail as string[]).includes(`${login}:${repo}#${v.number}`)) throw new Error(`boom ${repo}#${v.number}`);
    if (body.query.includes("mergeStateStatus")) {
      return ok({ data: { repository: { pullRequest: {
        id: nodeId(login, repo, v.number!), headRefOid: "a".repeat(40), baseRefOid: "c".repeat(40), headRefName: "f", baseRefName: "main",
        isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: `CLEAN_${login}_${repo}_${v.number}`, reviewDecision: "APPROVED", viewerCanUpdate: true,
        autoMergeRequest: null, mergeQueueEntry: null,
        reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        commits: { nodes: [{ commit: { oid: "a".repeat(40), statusCheckRollup: { state: "SUCCESS" } } }] },
        closingIssuesReferences: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      } } } });
    }
    if (body.query.includes("mentionableUsers")) {
      return ok({ data: { repository: { owner: { __typename: "User", login: "o" }, mentionableUsers: { nodes: [{ login: "ada", name: "Ada" }], pageInfo: { hasNextPage: false, endCursor: null } } } } });
    }
    return ok({ data: { repository: { pullRequest: null } } });
  }
  if (p.startsWith("/search/issues")) {
    const title = p.includes("is%3Aopen") ? "Open list" : "Match one";
    return ok({ total_count: 1, incomplete_results: false, items: [{ number: 12, title, state: "open", pull_request: null }] });
  }
  const issue = /\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)$/.exec(p);
  if (issue) return ok({ number: Number(issue[2]), title: "t", state: "open", labels: [], assignees: [], milestone: null, body: "", user: { login } });
  if (/\/rules\/branches\//.test(p)) return ok([]);
  return ok([]);
}

function install() {
  const held = new Map<string, { promise: Promise<void>; open: () => void }>();
  const g: Ghp1 = {
    calls: [], gates: [], renders: 0,
    data: { remotes: { [P1_REPO]: [{ name: "origin", url: "https://github.com/o/a.git" }], [P1_REPO2]: [{ name: "origin", url: "https://github.com/o/r2.git" }] }, fail: [], gateRemotes: false },
    hold: (pattern) => { let open = () => {}; const promise = new Promise<void>((r) => { open = r; }); held.set(pattern, { promise, open }); },
    release: (pattern) => { held.get(pattern)?.open(); held.delete(pattern); },
    releaseRemotes: (part) => {
      for (const gate of g.gates.filter((x) => JSON.stringify(x.result).includes(part))) gate.open();
      g.gates = g.gates.filter((x) => !JSON.stringify(x.result).includes(part));
    },
  };
  for (const pattern of window.__ghp1Init?.holds ?? []) g.hold(pattern);
  Object.assign(g.data, window.__ghp1Init?.data);
  window.__ghp1 = g;
  window.__L8GIT_TEST_INVOKE__ = async (cmd: string, raw?: Record<string, unknown>) => {
    const args = raw ?? {};
    g.calls.push({ cmd, args });
    if (cmd === "list_git_remotes" && g.data.gateRemotes) {
      const result = structuredClone(provider(cmd, args, g.data) as Remote[]); // captured now: models a read that started before an edit
      await new Promise<void>((open) => g.gates.push({ result, open }));
      return result;
    }
    // pr_detail is answered for the origin it started with and can be held by that origin (`origin=…`).
    const origin = cmd === "pr_detail" ? (g.data.remotes as Record<string, Remote[]>)[String(args.path)]?.[0]?.url : undefined;
    const early = origin ? provider(cmd, args, g.data) : undefined;
    const failed = !!origin && ((g.data.failDetail as string[] | undefined) ?? []).includes(origin);
    const key = `${cmd} ${JSON.stringify(args)}${origin ? ` origin=${origin}` : ""}`;
    for (const [pattern, h] of [...held]) if (key.includes(pattern)) await h.promise;
    if (failed) throw new Error(`detail boom ${origin}`);
    return origin ? early : provider(cmd, args, g.data);
  };
  useHubStore.setState({ accounts: [{ host: "github.com", provider: "github", login: "leon", name: null, avatar_url: null }], activeKey: "leon@github.com" });
}

/** Shows exactly what the live hook hands to consumers for the current scope. */
function PrProbe({ path, number }: { path: string; number: number }) {
  const gh = usePrGithub(path, number, null);
  return (
    <dl className="text-xs">
      <dt>probe</dt>
      <dd><output aria-label="Probe node">{gh.readiness?.id ?? "-"}</output></dd>
      <dd><output aria-label="Probe error">{gh.error ?? "-"}</output></dd>
      <dd><output aria-label="Probe loading">{String(gh.loading)}</output></dd>
    </dl>
  );
}

function TargetProbe({ path }: { path: string }) {
  const r = useGithubTarget(path);
  return <output aria-label="Target">{isTarget(r) ? `${r.account.login}:${r.fullName}` : r.reason}</output>;
}

function MentionScene() {
  const [text, setText] = useState("");
  // Counts every commit of the real textarea subtree, so a setState-in-effect loop shows up as runaway renders.
  return (
    <div className="p-4">
      <Profiler id="mention" onRender={() => { window.__ghp1.renders++; }}>
        <MentionTextarea path={P1_REPO} value={text} onChange={setText} aria-label="Body" />
      </Profiler>
    </div>
  );
}

export default function GithubP1Scene({ scene }: { scene: string }) {
  useState(() => { install(); return true; });
  const [path, setPath] = useState(P1_REPO);
  const [number, setNumber] = useState(1);
  const [remoteOpen, setRemoteOpen] = useState(false);
  if (scene === "ghp1-mention") return <MentionScene />;
  return (
    <div className="flex h-screen flex-col gap-2 p-4">
      <div className="flex gap-2">
        <Button onClick={() => setNumber(1)}>PR 1</Button>
        <Button onClick={() => setNumber(2)}>PR 2</Button>
        <Button onClick={() => setPath(path === P1_REPO ? P1_REPO2 : P1_REPO)}>Switch repo</Button>
        <Button onClick={() => useHubStore.setState({
          accounts: [{ host: "github.com", provider: "github", login: "ada", name: null, avatar_url: null }, ...useHubStore.getState().accounts],
          activeKey: "ada@github.com",
        })}>Switch account</Button>
        <Button onClick={() => setRemoteOpen(true)}>Edit remote</Button>
        <Button onClick={() => void useRepoStore.getState().reload(path)}>Reload repo</Button>
        <TargetProbe path={path} />
      </div>
      <PrProbe path={path} number={number} />
      <div className="min-h-0 flex-1 overflow-auto">
        <PullRequestInspectDetail path={path} number={number} onClose={() => {}} onMutated={() => {}} />
      </div>
      <EditRemoteDialog open={remoteOpen} onClose={() => setRemoteOpen(false)} path={path} />
      <Toaster />
    </div>
  );
}
