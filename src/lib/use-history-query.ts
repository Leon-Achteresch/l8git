import { readGit, type HistoryFilter } from './ipc/git';
export type { HistoryFilter } from './ipc/git';
export { EMPTY_HISTORY_FILTER } from './history-filters';
import { historyFilterKey, sanitizeHistoryFilter } from './history-filters';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Commit } from './repo-store';

const PAGE_SIZE = 80;
const EMPTY_COMMITS: Commit[] = [];

type HistoryPageState = { key: string; commits: Commit[]; loading: boolean; exhausted: boolean; error: string };

export function useHistoryQuery(path: string, filter: HistoryFilter, enabled: boolean, revision: string) {
  const filterKey = historyFilterKey(filter);
  const requestFilter = useMemo(() => sanitizeHistoryFilter(filter), [filterKey]);
  const key = JSON.stringify([path, filterKey, enabled, revision]);
  const generation = useRef(0);
  const pending = useRef(false);
  const count = useRef(0);
  const [state, setState] = useState<HistoryPageState>({ key: '', commits: EMPTY_COMMITS, loading: false, exhausted: false, error: '' });

  const load = useCallback(async (reset = false) => {
    if (!enabled || (pending.current && !reset)) return;
    if (reset) generation.current++;
    const epoch = generation.current;
    pending.current = true;
    const skip = reset ? 0 : count.current;
    setState(previous => ({ ...previous, key, ...(reset ? { commits: EMPTY_COMMITS, exhausted: false } : {}), loading: true, error: '' }));
    try {
      const commits = await readGit('repo_history_page', { path, filter: requestFilter, skip, limit: PAGE_SIZE });
      if (generation.current !== epoch) return;
      count.current = skip + commits.length;
      setState(previous => ({ key, commits: reset ? commits : [...previous.commits, ...commits], loading: false, exhausted: commits.length < PAGE_SIZE, error: '' }));
    } catch (error) {
      if (generation.current === epoch) setState(previous => ({ ...previous, loading: false, error: String(error) }));
    } finally {
      if (generation.current === epoch) pending.current = false;
    }
  }, [enabled, key, path, requestFilter]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => void load(true), 250);
    return () => {
      clearTimeout(timer);
      generation.current++;
      pending.current = false;
    };
  }, [enabled, load]);

  const current = state.key === key;
  const loadMore = useCallback(() => {
    if (current && !state.loading && !state.exhausted && !state.error) void load();
  }, [current, state.loading, state.exhausted, state.error, load]);
  const retry = useCallback(() => {
    if (!pending.current) void load(!current || state.commits.length === 0);
  }, [current, state.commits.length, load]);

  return {
    commits: current ? state.commits : EMPTY_COMMITS,
    loading: enabled && (!current || state.loading),
    exhausted: current && state.exhausted,
    error: current ? state.error : '',
    loadMore,
    retry,
  };
}
