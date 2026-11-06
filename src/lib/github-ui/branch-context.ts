import { useEffect } from "react";
import { create } from "zustand";

import { branchContextKey, useGithubWorkspace, type BranchContext } from "@/lib/github-expansion/store";
import { readRepoViewState } from "@/lib/repo-view-state";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore, type SidebarTab } from "@/lib/ui-store";

/**
 * ID 68: per-(repository, branch) view context. Outgoing branch keeps panel/file/scroll/agent task, the incoming
 * branch's saved context is restored. Only view pointers are stored — never commit drafts or editor text.
 */

const PANELS: readonly SidebarTab[] = ["commit", "history", "stash", "pr", "ci", "submodules", "worktrees", "hooks", "tools"];
export const isSidebarTab = (v: unknown): v is SidebarTab => PANELS.includes(v as SidebarTab);

export type BranchSwitch = { path: string; from: string; to: string };

/** Detects in-place branch changes per repository; new/removed repositories and empty (loading) branches are not switches. */
export function branchSwitches(known: ReadonlyMap<string, string>, repos: Record<string, { branch?: string | null } | undefined>) {
  const next = new Map<string, string>();
  const switches: BranchSwitch[] = [];
  for (const [path, repo] of Object.entries(repos)) {
    const branch = repo?.branch || known.get(path);
    if (!branch) continue;
    next.set(path, branch);
    const from = known.get(path);
    if (from && from !== branch) switches.push({ path, from, to: branch });
  }
  return { next, switches };
}

/** Agent task pointer, scoped to the provider so a thread id never resolves in another provider. */
export const taskKeyOf = (provider: string, threadId: string) => JSON.stringify([provider, threadId]);
export function parseTaskKey(key: string | undefined): { provider: string; threadId: string } | null {
  try {
    const v = key ? JSON.parse(key) : null;
    return Array.isArray(v) && typeof v[0] === "string" && typeof v[1] === "string" ? { provider: v[0], threadId: v[1] } : null;
  } catch { return null; }
}

export type BranchRestoreRequest = { id: number; path: string; branch: string; file?: string; scrollTop?: number };
/** Consumed by mounted panels; each consumer checks path + current branch so late status for another branch never applies. */
export const useBranchRestore = create<{ request: BranchRestoreRequest | null }>(() => ({ request: null }));

const contextOf = (path: string, branch: string): BranchContext | undefined => useGithubWorkspace.getState().branchContexts[branchContextKey(path, branch)];

/** Records a user-chosen file for the branch at the time of the click (not the panel's automatic fallback). */
export function rememberBranchFile(path: string, branch: string | null | undefined, file: string) {
  if (!path || !branch) return;
  const prev = contextOf(path, branch);
  useGithubWorkspace.getState().saveBranchContext(path, branch, { ...prev, panel: prev?.panel ?? useUiStore.getState().sidebarTab, file });
}

let seq = 0;
const latest = new Map<string, number>();

/** Captures the outgoing agent task before restoring the incoming one, in one sequence (no capture/restore race). */
async function syncTask(path: string, from: string, incomingKey: string | undefined, id: number) {
  const { useAgentChatStore } = await import("@/lib/agents/active-chat-store");
  const { activeAgentProvider } = await import("@/lib/agents/provider-store");
  const provider = activeAgentProvider();
  const store = useAgentChatStore.getState();
  const current = store.activeThreadByPath[path];
  const saved = contextOf(path, from);
  if (saved) useGithubWorkspace.getState().saveBranchContext(path, from, { ...saved, taskKey: current ? taskKeyOf(provider, current) : undefined });
  const task = parseTaskKey(incomingKey);
  if (!task || latest.get(path) !== id || task.provider !== provider) return;
  // Only threads that still exist for this repository; nothing is created or faked.
  if (current === task.threadId || !store.threadsByPath[path]?.some((t) => t.id === task.threadId)) return;
  await store.openThread(path, task.threadId);
}

export function handleBranchSwitch({ path, from, to }: BranchSwitch) {
  const id = ++seq;
  latest.set(path, id);
  const ui = useUiStore.getState();
  const isActive = useRepoStore.getState().activePath === path;
  const prev = contextOf(path, from);
  const outgoing: BranchContext = {
    ...prev,
    panel: isActive ? ui.sidebarTab : prev?.panel ?? ui.sidebarTab,
    scrollTop: readRepoViewState(path).filesScroll?.offset ?? prev?.scrollTop,
  };
  useGithubWorkspace.getState().saveBranchContext(path, from, outgoing);

  const incoming = contextOf(path, to);
  void syncTask(path, from, incoming?.taskKey, id).catch(() => undefined);
  if (!incoming) return;
  if (isActive && isSidebarTab(incoming.panel) && incoming.panel !== ui.sidebarTab) ui.setSidebarTab(incoming.panel);
  useBranchRestore.setState({ request: { id, path, branch: to, file: incoming.file, scrollTop: incoming.scrollTop } });
}

/** Root-mounted bridge: listens to real branch values in the repository store. */
export function useBranchContextBridge() {
  useEffect(() => {
    let known = branchSwitches(new Map(), useRepoStore.getState().repos).next;
    return useRepoStore.subscribe((state) => {
      const { next, switches } = branchSwitches(known, state.repos);
      known = next;
      for (const sw of switches) handleBranchSwitch(sw);
    });
  }, []);
}
