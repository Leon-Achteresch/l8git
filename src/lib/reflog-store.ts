import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

import { useRepoStore } from '@/lib/repo-store';
import type {
  ReflogEntry,
  ReflogResetMode,
  UndoPreview,
  UndoResult,
} from '@/lib/reflog-format';

export const REFLOG_PAGE_SIZE = 60;

type ReflogState = {
  entries: Record<string, ReflogEntry[]>;
  loading: Record<string, boolean>;
  exhausted: Record<string, boolean>;
  error: Record<string, string | null>;
  load: (path: string) => Promise<void>;
  loadMore: (path: string) => Promise<void>;
  undoPreview: (path: string) => Promise<UndoPreview>;
  undoLast: (path: string) => Promise<UndoResult>;
  resetToEntry: (
    path: string,
    selector: string,
    mode: ReflogResetMode,
  ) => Promise<UndoResult>;
};

export async function commitFullMessage(
  path: string,
  hash: string,
): Promise<string> {
  return invoke<string>('commit_full_message', { path, hash });
}

async function fetchPage(
  path: string,
  skip: number,
): Promise<ReflogEntry[]> {
  return invoke<ReflogEntry[]>('reflog_list', {
    path,
    limit: REFLOG_PAGE_SIZE,
    skip,
  });
}

export const useReflogStore = create<ReflogState>((set, get) => ({
  entries: {},
  loading: {},
  exhausted: {},
  error: {},

  load: async (path) => {
    if (get().loading[path]) return;
    set((s) => ({
      loading: { ...s.loading, [path]: true },
      error: { ...s.error, [path]: null },
    }));
    try {
      const page = await fetchPage(path, 0);
      set((s) => ({
        entries: { ...s.entries, [path]: page },
        exhausted: { ...s.exhausted, [path]: page.length < REFLOG_PAGE_SIZE },
      }));
    } catch (e) {
      set((s) => ({ error: { ...s.error, [path]: String(e) } }));
    } finally {
      set((s) => ({ loading: { ...s.loading, [path]: false } }));
    }
  },

  loadMore: async (path) => {
    const state = get();
    if (state.loading[path] || state.exhausted[path]) return;
    const current = state.entries[path] ?? [];
    set((s) => ({ loading: { ...s.loading, [path]: true } }));
    try {
      const page = await fetchPage(path, current.length);
      set((s) => {
        const known = new Set((s.entries[path] ?? []).map((e) => e.selector));
        const merged = [
          ...(s.entries[path] ?? []),
          ...page.filter((e) => !known.has(e.selector)),
        ];
        return {
          entries: { ...s.entries, [path]: merged },
          exhausted: { ...s.exhausted, [path]: page.length < REFLOG_PAGE_SIZE },
        };
      });
    } catch (e) {
      set((s) => ({ error: { ...s.error, [path]: String(e) } }));
    } finally {
      set((s) => ({ loading: { ...s.loading, [path]: false } }));
    }
  },

  undoPreview: async (path) => invoke<UndoPreview>('undo_preview', { path }),

  undoLast: async (path) => {
    const result = await invoke<UndoResult>('undo_last_operation', { path });
    await useRepoStore.getState().refreshOpenRepo(path);
    await get().load(path);
    return result;
  },

  resetToEntry: async (path, selector, mode) => {
    const result = await invoke<UndoResult>('reset_to_reflog_entry', {
      path,
      selector,
      mode,
    });
    await useRepoStore.getState().refreshOpenRepo(path);
    await get().load(path);
    return result;
  },
}));
