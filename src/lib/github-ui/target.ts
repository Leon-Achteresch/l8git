import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { HUB_PATH_PREFIX, useHubStore } from "@/lib/hub/store";
import type { HubAccount } from "@/lib/hub/types";
import { useRepoStore } from "@/lib/repo-store";

export type GithubTarget = { account: HubAccount; fullName: string; host: string };
export type GithubTargetMiss = { reason: "loading" | "no-remote" | "no-account" | "not-github" };
export type GithubTargetResult = GithubTarget | GithubTargetMiss;

type Remote = { name: string; url: string };

/** `git@h:o/r.git`, `ssh://git@h/o/r`, `https://h/o/r.git` → `{ host, fullName }`. */
export function parseRemoteUrl(url: string): { host: string; fullName: string } | null {
  const raw = url.trim();
  const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(raw);
  let host: string;
  let rest: string;
  if (scp && !raw.includes("://")) {
    [, host, rest] = scp;
  } else {
    try {
      const u = new URL(raw);
      host = u.hostname;
      rest = u.pathname;
    } catch {
      return null;
    }
  }
  const segs = rest.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "").split("/").filter(Boolean);
  if (segs.length < 2 || segs.some((s) => s === "." || s === "..")) return null;
  return { host: host.toLowerCase(), fullName: segs.slice(-2).join("/") };
}

/** `hub:login@host/owner/repo` → its parts. */
export function parseHubPath(path: string): { login: string; host: string; fullName: string } | null {
  if (!path.startsWith(HUB_PATH_PREFIX)) return null;
  const m = /^([^@/]+)@([^/]+)\/([^/]+\/[^/]+)$/.exec(path.slice(HUB_PATH_PREFIX.length));
  return m ? { login: m[1], host: m[2].toLowerCase(), fullName: m[3] } : null;
}

/** Picks the GitHub account for a host; prefers the active one, then the first match. */
export function pickAccount(accounts: HubAccount[], host: string, activeKey: string | null, login?: string): HubAccount | null {
  const onHost = accounts.filter((a) => a.host.toLowerCase() === host && (!login || a.login === login));
  return onHost.find((a) => `${a.login}@${a.host}` === activeKey) ?? onHost[0] ?? null;
}

export function resolveTarget(
  path: string,
  remotes: Remote[],
  accounts: HubAccount[],
  activeKey: string | null,
): GithubTargetResult {
  const hub = parseHubPath(path);
  const parsed = hub ?? (() => {
    const origin = remotes.find((r) => r.name === "origin") ?? remotes[0];
    return origin ? parseRemoteUrl(origin.url) : null;
  })();
  if (!parsed) return { reason: "no-remote" };
  const account = pickAccount(accounts, parsed.host, activeKey, hub?.login);
  if (!account) return { reason: "no-account" };
  if (account.provider !== "github") return { reason: "not-github" };
  return { account, fullName: parsed.fullName, host: parsed.host };
}

export const isTarget = (r: GithubTargetResult): r is GithubTarget => "account" in r;

type RemoteEntry = { remotes: Remote[] | null };
const LOADING: RemoteEntry = { remotes: null };
// Shared per-path remote reads. Revalidated on every repo reload and first mount, hard-invalidated
// after remote edits; a read only lands if no newer read or invalidation started since.
const remoteEntries = new Map<string, RemoteEntry>();
const remoteGen = new Map<string, number>();
const remotePending = new Set<string>();
const remoteListeners = new Set<() => void>();
const emitRemotes = () => remoteListeners.forEach((l) => { l(); });
const subscribeRemotes = (l: () => void) => {
  remoteListeners.add(l);
  return () => void remoteListeners.delete(l);
};

function readRemotes(path: string, keepShown: boolean) {
  const gen = (remoteGen.get(path) ?? 0) + 1;
  remoteGen.set(path, gen);
  remotePending.add(path);
  if (!keepShown || !remoteEntries.has(path)) {
    remoteEntries.set(path, LOADING);
    emitRemotes();
  }
  void invoke<Remote[]>("list_git_remotes", { path })
    .catch((): Remote[] => [])
    .then((remotes) => {
      if (remoteGen.get(path) !== gen) return;
      remotePending.delete(path);
      const shown = remoteEntries.get(path)?.remotes;
      if (shown && JSON.stringify(shown) === JSON.stringify(remotes)) return; // unchanged: keep target identity
      remoteEntries.set(path, { remotes });
      emitRemotes();
    });
}

/** Call after adding/changing/removing a remote: drops the cached target until the new remotes are read. */
export function invalidateGithubTarget(path: string) {
  if (!path.startsWith(HUB_PATH_PREFIX)) readRemotes(path, false);
}

// Any repo reload (watcher, fetch, remote dialog) re-reads the remotes of paths in use.
useRepoStore.subscribe((s, prev) => {
  if (s.repos === prev.repos) return;
  for (const path of remoteEntries.keys()) if (s.repos[path] && s.repos[path] !== prev.repos[path]) readRemotes(path, true);
});

const HUB_REMOTES: Remote[] = [];

/** Resolves a local repo or `hub:` path to the connected GitHub account + `owner/repo`. */
export function useGithubTarget(path: string): GithubTargetResult {
  const accounts = useHubStore((s) => s.accounts);
  const activeKey = useHubStore((s) => s.activeKey);
  const hub = path.startsWith(HUB_PATH_PREFIX);
  const entry = useSyncExternalStore(subscribeRemotes, () => (hub ? null : remoteEntries.get(path)));

  useEffect(() => {
    if (!hub && !remotePending.has(path)) readRemotes(path, true);
  }, [hub, path]);

  const remotes = hub ? HUB_REMOTES : (entry?.remotes ?? null);
  // Stable identity so consumers can depend on the target object.
  return useMemo(
    () => (remotes === null ? { reason: "loading" as const } : resolveTarget(path, remotes, accounts, activeKey)),
    [path, remotes, accounts, activeKey],
  );
}
