import { formatBackendError } from '@/lib/backend-error';
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import {
  COMMIT_SEARCH_DEBOUNCE_MS,
  useRepoStore,
  type Commit,
  type CommitSearchHit,
} from "./repo-store";
import { useUiStore } from "./ui-store";
import { useWorkspacePrefs } from "./workspace-prefs";

export const CROSS_REPO_MIN_QUERY = 2;
export const CROSS_REPO_CONCURRENCY = 4;
export const CROSS_REPO_PER_REPO_LIMIT = 5;
// shortcut: only the newest 10k commits per repo are scanned, raise it if users miss old hits.
const CROSS_REPO_SCAN_LIMIT = 10_000;

export type RepoSearchOutcome =
  | { path: string; ok: true; hits: Commit[] }
  | { path: string; ok: false; error: string };

/**
 * Runs `search` for every path with at most `concurrency` calls in flight.
 * Each outcome is reported as soon as it lands, so a slow or failing repo
 * never holds back the others. Once `isStale()` is true no further repo is
 * started and no further outcome is reported.
 */
export async function runCrossRepoSearch({
  paths,
  query,
  search,
  onResult,
  isStale,
  concurrency = CROSS_REPO_CONCURRENCY,
  perRepoLimit = CROSS_REPO_PER_REPO_LIMIT,
}: {
  paths: readonly string[];
  query: string;
  search: (path: string, query: string, limit: number) => Promise<Commit[]>;
  onResult: (outcome: RepoSearchOutcome) => void;
  isStale: () => boolean;
  concurrency?: number;
  perRepoLimit?: number;
}): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < paths.length && !isStale()) {
      const path = paths[next++];
      let outcome: RepoSearchOutcome;
      try {
        const hits = await search(path, query, perRepoLimit);
        outcome = { path, ok: true, hits: hits.slice(0, perRepoLimit) };
      } catch (e) {
        outcome = { path, ok: false, error: formatBackendError(e) };
      }
      if (isStale()) return;
      onResult(outcome);
    }
  };
  const workers = Math.max(1, Math.min(concurrency, paths.length));
  await Promise.all(Array.from({ length: workers }, worker));
}

async function searchRepoCommits(path: string, query: string, limit: number): Promise<Commit[]> {
  const hits = await invoke<CommitSearchHit[]>("repo_search_commits", {
    path,
    query,
    skip: 0,
    limit,
    hideT3Checkpoints: useWorkspacePrefs.getState().hideT3Checkpoints,
    // Path matching needs a --name-only walk; too slow across dozens of repos.
    searchPaths: false,
    scanLimit: CROSS_REPO_SCAN_LIMIT,
  });
  return hits.map((h) => h.commit);
}

export type CrossRepoCommitResults = {
  /** Repos with hits, in the order of `paths`. */
  groups: { path: string; hits: Commit[] }[];
  pending: number;
  failed: { path: string; error: string }[];
};

const EMPTY: CrossRepoCommitResults = { groups: [], pending: 0, failed: [] };

/** Debounced commit search across `paths`; outcomes of a replaced query are dropped. */
export function useCrossRepoCommitSearch(
  paths: readonly string[],
  query: string,
  enabled: boolean,
): CrossRepoCommitResults {
  const [results, setResults] = useState<CrossRepoCommitResults>(EMPTY);
  const q = query.trim();
  const pathsKey = paths.join("\n");

  useEffect(() => {
    if (!enabled || q.length < CROSS_REPO_MIN_QUERY || pathsKey === "") {
      setResults(EMPTY);
      return;
    }
    const list = pathsKey.split("\n");
    let stale = false;
    // Drop the previous query's hits at once; "searching" covers the debounce.
    setResults({ groups: [], pending: list.length, failed: [] });
    const timer = window.setTimeout(() => {
      const byPath = new Map<string, Commit[]>();
      const failed: CrossRepoCommitResults["failed"] = [];
      let pending = list.length;
      void runCrossRepoSearch({
        paths: list,
        query: q,
        search: searchRepoCommits,
        isStale: () => stale,
        onResult: (outcome) => {
          pending--;
          if (outcome.ok) {
            if (outcome.hits.length > 0) byPath.set(outcome.path, outcome.hits);
          } else {
            failed.push({ path: outcome.path, error: outcome.error });
          }
          setResults({
            groups: list.filter((p) => byPath.has(p)).map((p) => ({ path: p, hits: byPath.get(p)! })),
            pending,
            failed: [...failed],
          });
        },
      });
    }, COMMIT_SEARCH_DEBOUNCE_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [enabled, q, pathsKey]);

  return results;
}

function waitForRepo(path: string, timeoutMs = 10_000): Promise<boolean> {
  const ready = () => {
    const s = useRepoStore.getState();
    return !s.loading[path] && !!s.repos[path];
  };
  if (ready()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      unsubscribe();
      window.clearTimeout(timer);
      resolve(ok);
    };
    const unsubscribe = useRepoStore.subscribe(() => {
      if (ready()) done(true);
    });
    const timer = window.setTimeout(() => done(ready()), timeoutMs);
  });
}

const PAGE = 500;
const MAX_EXTRA_PAGES = Math.ceil(CROSS_REPO_SCAN_LIMIT / PAGE);

/**
 * Makes `path` the active repo, shows its history and focuses `hash`. The
 * history list only focuses loaded commits, so older hits page in first.
 */
export async function openCommitInRepo(path: string, hash: string): Promise<boolean> {
  const repoStore = useRepoStore.getState();
  if (repoStore.activePath !== path) repoStore.setActive(path);
  useUiStore.getState().setSidebarTab("history");
  if (!(await waitForRepo(path))) return false;
  const commitCount = () => useRepoStore.getState().repos[path]?.commits.length ?? 0;
  const loaded = () => useRepoStore.getState().repos[path]?.commits.some((c) => c.hash === hash) ?? false;
  let idle = 0;
  for (let i = 0; i < MAX_EXTRA_PAGES && !loaded() && idle < 3; i++) {
    if (useRepoStore.getState().activePath !== path) return true;
    const before = commitCount();
    // 0 also means another load is in flight; wait for it instead of giving up.
    if ((await useRepoStore.getState().loadMoreCommits(path, PAGE)) === 0) {
      await new Promise((r) => window.setTimeout(r, 200));
      idle = commitCount() === before ? idle + 1 : 0;
    } else {
      idle = 0;
    }
  }
  // The user moved on to another repo; nothing to report.
  if (useRepoStore.getState().activePath !== path) return true;
  if (!loaded()) return false;
  useUiStore.getState().requestCommitHistoryFocus(path, hash);
  return true;
}
