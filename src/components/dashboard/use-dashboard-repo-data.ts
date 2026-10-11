import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { HealthReadStates, HealthSource, RepoHealthData } from "@/lib/dashboard-aggregations";
import { useRepoStore, type StatusEntry, type UpstreamSyncCounts } from "@/lib/repo-store";

const commands: Record<HealthSource, string> = {
  status: "repo_full_status", stashes: "list_stashes", worktrees: "list_worktrees",
  bisect: "git_bisect_status", cherryPick: "cherry_pick_state", mergeState: "merge_state", rebase: "rebase_status",
};
const sources = Object.keys(commands) as HealthSource[];
function initialReads(loading = false): HealthReadStates {
  return Object.fromEntries(sources.map(source => [source, { loading, checked: false, error: null }]));
}

export type DashboardHealthSnapshot = { path: string | null; data: RepoHealthData; sources: HealthReadStates };
type HealthInvoke = <T>(command: string, args: { path: string }) => Promise<T>;

/** A failed read keeps its last value. Only the current path and refresh can publish replies. */
export class DashboardHealthReader {
  private snapshot: DashboardHealthSnapshot = { path: null, data: {}, sources: initialReads() };
  private epoch = 0;
  private listeners = new Set<() => void>();
  constructor(private transport: HealthInvoke, private onSuccess?: (path: string, data: RepoHealthData) => void,
    private currentPath?: () => string | null) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: DashboardHealthSnapshot) { this.snapshot = next; for (const listener of this.listeners) listener(); }
  setPath(path: string | null, cached: RepoHealthData = {}) {
    this.epoch += 1;
    this.publish({ path, data: { ...cached }, sources: initialReads() });
  }
  cancel = () => { this.epoch += 1; };
  refresh = async (): Promise<void> => {
    const path = this.snapshot.path;
    if (!path) return;
    const epoch = ++this.epoch;
    const isCurrent = () => this.epoch === epoch && this.snapshot.path === path && (!this.currentPath || this.currentPath() === path);
    this.publish({ ...this.snapshot, sources: Object.fromEntries(sources.map(source => [source,
      { ...this.snapshot.sources[source], loading: true, error: null }])) });
    await Promise.all(sources.map(async source => {
      try {
        const result = await this.transport<unknown>(commands[source], { path });
        let patch: RepoHealthData;
        if (source === "status") {
          const full = result as { entries: StatusEntry[]; upstream_sync: UpstreamSyncCounts; has_upstream: boolean };
          if (!full || !Array.isArray(full.entries) || typeof full.has_upstream !== "boolean" || !full.upstream_sync ||
            ![full.upstream_sync.ahead, full.upstream_sync.behind].every(value => Number.isSafeInteger(value) && value >= 0)) {
            throw Error("Repository status response is incomplete.");
          }
          patch = { status: full.entries, upstreamSync: full.upstream_sync, hasUpstream: full.has_upstream };
        } else {
          const valid = source === "stashes" || source === "worktrees" ? Array.isArray(result)
            : result && typeof result === "object" && (source === "bisect" ? typeof (result as { active?: unknown }).active === "boolean"
              : typeof (result as { in_progress?: unknown }).in_progress === "boolean" && Array.isArray((result as { conflicted_paths?: unknown }).conflicted_paths));
          if (!valid) throw Error("Repository health response is incomplete.");
          patch = { [source]: result } as RepoHealthData;
        }
        if (!isCurrent()) return;
        this.onSuccess?.(path, patch);
        this.publish({ ...this.snapshot, data: { ...this.snapshot.data, ...patch },
          sources: { ...this.snapshot.sources, [source]: { loading: false, checked: true, error: null } } });
      } catch (cause) {
        if (!isCurrent()) return;
        this.publish({ ...this.snapshot, sources: { ...this.snapshot.sources,
          [source]: { ...this.snapshot.sources[source], loading: false, error: cause instanceof Error ? cause.message : String(cause) } } });
      }
    }));
  };
}

type OperationHealth = Pick<RepoHealthData, "cherryPick" | "mergeState" | "rebase">;
function copyOperations(data: OperationHealth): OperationHealth {
  return {
    ...(data.cherryPick === undefined ? {} : { cherryPick: { ...data.cherryPick, conflicted_paths: [...data.cherryPick.conflicted_paths] } }),
    ...(data.mergeState === undefined ? {} : { mergeState: { ...data.mergeState, conflicted_paths: [...data.mergeState.conflicted_paths] } }),
    ...(data.rebase === undefined ? {} : { rebase: { ...data.rebase, conflicted_paths: [...data.rebase.conflicted_paths],
      ...(Array.isArray(data.rebase.todo) ? { todo: data.rebase.todo.map(line => ({ ...line })) } : {}),
      ...(data.rebase.stopped ? { stopped: { ...data.rebase.stopped } } : {}) } }),
  };
}

/** Legacy operation readers replace errors with inactive state; cache only verified health replies. */
export class DashboardOperationCache {
  private entries = new Map<string, OperationHealth>();
  read(path: string): OperationHealth {
    const data = this.entries.get(path);
    if (!data) return {};
    this.entries.delete(path); this.entries.set(path, data);
    return copyOperations(data);
  }
  remember(path: string, patch: RepoHealthData) {
    const operations = copyOperations(patch);
    if (!Object.keys(operations).length) return;
    const data = { ...this.entries.get(path), ...operations };
    this.entries.delete(path); this.entries.set(path, data);
    if (this.entries.size > 64) this.entries.delete(this.entries.keys().next().value!);
  }
}
const verifiedOperations = new DashboardOperationCache();

function cachedHealth(path: string | null, cache: DashboardOperationCache): RepoHealthData {
  if (!path) return {};
  const state = useRepoStore.getState();
  return { status: state.status[path], upstreamSync: state.upstreamSync[path], hasUpstream: state.hasUpstream[path],
    stashes: state.stashes[path], worktrees: state.worktrees[path], bisect: state.bisect[path],
    ...cache.read(path) };
}
function applyHealth(path: string, data: RepoHealthData) {
  useRepoStore.setState(state => ({
    ...(data.status === undefined ? {} : { status: { ...state.status, [path]: [...data.status] } }),
    ...(data.upstreamSync === undefined ? {} : { upstreamSync: { ...state.upstreamSync, [path]: data.upstreamSync } }),
    ...(data.hasUpstream === undefined ? {} : { hasUpstream: { ...state.hasUpstream, [path]: data.hasUpstream } }),
    ...(data.stashes === undefined ? {} : { stashes: { ...state.stashes, [path]: [...data.stashes] } }),
    ...(data.worktrees === undefined ? {} : { worktrees: { ...state.worktrees, [path]: [...data.worktrees] } }),
    ...(data.bisect === undefined ? {} : { bisect: { ...state.bisect, [path]: data.bisect } }),
    ...(data.cherryPick === undefined ? {} : { cherryPickState: { ...state.cherryPickState, [path]: data.cherryPick } }),
    ...(data.mergeState === undefined ? {} : { mergeState: { ...state.mergeState, [path]: data.mergeState } }),
    ...(data.rebase === undefined ? {} : { rebaseState: { ...state.rebaseState, [path]: data.rebase } }),
  }));
}

export function createDashboardHealthScope(transport: HealthInvoke, currentPath?: () => string | null,
  cache = verifiedOperations) {
  return {
    reader: new DashboardHealthReader(transport, (path, data) => { applyHealth(path, data); cache.remember(path, data); }, currentPath),
    cached: (path: string | null) => cachedHealth(path, cache),
  };
}

export function useDashboardRepoData(path: string | null) {
  const current = useRef(path);
  current.current = path;
  const [scope] = useState(() => createDashboardHealthScope(invoke, () => current.current));
  const reader = scope.reader;
  const snapshot = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
  useEffect(() => {
    reader.setPath(path, scope.cached(path));
    void reader.refresh();
    return reader.cancel;
  }, [path, reader, scope]);
  // Path changes are visible during render, before an effect can cancel the old reads.
  const scoped = snapshot.path === path ? snapshot : { path, data: scope.cached(path), sources: initialReads(Boolean(path)) };
  return { ...scoped, refreshing: Object.values(scoped.sources).some(source => source.loading), refresh: reader.refresh };
}
