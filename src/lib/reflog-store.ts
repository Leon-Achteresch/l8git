import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

import { useRepoStore } from '@/lib/repo-store';
import { sameReflogEntry, type ReflogEntry, type ReflogResetMode, type UndoPreview, type UndoResult } from '@/lib/reflog-format';

export const REFLOG_PAGE_SIZE = 60;
const generations = new Map<string, number>();

function nextGeneration(path: string): number {
  const generation = (generations.get(path) ?? 0) + 1;
  generations.set(path, generation);
  return generation;
}

type ReflogState = {
  entries: Record<string, ReflogEntry[]>;
  loading: Record<string, boolean>;
  exhausted: Record<string, boolean>;
  error: Record<string, string | null>;
  refreshWarning: Record<string, boolean>;
  load: (path: string) => Promise<void>;
  loadMore: (path: string) => Promise<void>;
  refreshViews: (path: string) => Promise<void>;
  undoPreview: (path: string) => Promise<UndoPreview>;
  undoLast: (path: string, expectedSnapshot: string) => Promise<UndoResult>;
  resetToEntry: (path: string, selector: string, mode: ReflogResetMode, expectedHash: string, expectedHead: string) => Promise<UndoResult>;
};

export async function commitFullMessage(path: string, hash: string): Promise<string> {
  return invoke<string>('commit_full_message', { path, hash });
}

async function fetchPage(path: string, skip: number, limit = REFLOG_PAGE_SIZE): Promise<ReflogEntry[]> {
  return invoke<ReflogEntry[]>('reflog_list', { path, limit, skip });
}

export const useReflogStore = create<ReflogState>((set, get) => {
  async function refreshAfterMutation(path: string) {
    // A successful mutation stays successful even if the subsequent UI refresh fails.
    const results = await Promise.allSettled([
      Promise.resolve().then(() => useRepoStore.getState().refreshOpenRepo(path)),
      Promise.resolve().then(() => get().load(path)),
    ]);
    const failed = results.some((result) => result.status === 'rejected') || !!get().error[path];
    set((state) => ({ refreshWarning: { ...state.refreshWarning, [path]: failed } }));
  }

  return {
    entries: {}, loading: {}, exhausted: {}, error: {}, refreshWarning: {},
    refreshViews: refreshAfterMutation,

    load: async (path) => {
      // Explicit refresh supersedes an older in-flight load instead of skipping it.
      const generation = nextGeneration(path);
      set((state) => ({ loading: { ...state.loading, [path]: true }, error: { ...state.error, [path]: null } }));
      try {
        const page = await fetchPage(path, 0);
        if (generations.get(path) !== generation) return;
        set((state) => ({
          entries: { ...state.entries, [path]: page },
          exhausted: { ...state.exhausted, [path]: page.length < REFLOG_PAGE_SIZE },
        }));
      } catch (error) {
        if (generations.get(path) === generation) set((state) => ({ error: { ...state.error, [path]: String(error) } }));
      } finally {
        if (generations.get(path) === generation) set((state) => ({ loading: { ...state.loading, [path]: false } }));
      }
    },

    loadMore: async (path) => {
      const state = get();
      if (state.loading[path] || state.exhausted[path]) return;
      const current = state.entries[path] ?? [];
      if (!current.length) return get().load(path);
      const generation = nextGeneration(path);
      set((state) => ({ loading: { ...state.loading, [path]: true }, error: { ...state.error, [path]: null } }));
      try {
        // Fetch one overlapping operation and check HEAD after the page request.
        // A changing log restarts pagination rather than mixing shifted selectors.
        const page = await fetchPage(path, current.length - 1, REFLOG_PAGE_SIZE + 1);
        const [head] = await fetchPage(path, 0, 1);
        if (generations.get(path) !== generation) return;
        if (!sameReflogEntry(current[current.length - 1], page[0]) || !sameReflogEntry(current[0], head)) {
          await get().load(path);
          return;
        }
        set((state) => ({
          entries: { ...state.entries, [path]: [...current, ...page.slice(1)] },
          exhausted: { ...state.exhausted, [path]: page.length < REFLOG_PAGE_SIZE + 1 },
        }));
      } catch (error) {
        if (generations.get(path) === generation) set((state) => ({ error: { ...state.error, [path]: String(error) } }));
      } finally {
        if (generations.get(path) === generation) set((state) => ({ loading: { ...state.loading, [path]: false } }));
      }
    },

    undoPreview: async (path) => invoke<UndoPreview>('undo_preview', { path }),

    undoLast: async (path, expectedSnapshot) => {
      if (!expectedSnapshot) throw new Error('An undo preview is required.');
      const result = await invoke<UndoResult>('undo_last_operation', { path, expectedSnapshot });
      await refreshAfterMutation(path);
      return result;
    },

    resetToEntry: async (path, selector, mode, expectedHash, expectedHead) => {
      if (!expectedHash || !expectedHead) throw new Error('The reset target and current HEAD must be reviewed first.');
      const result = await invoke<UndoResult>('reset_to_reflog_entry', { path, selector, mode, expectedHash, expectedHead });
      await refreshAfterMutation(path);
      return result;
    },
  };
});
