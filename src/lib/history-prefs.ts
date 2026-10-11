import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { HistoryFilter } from './ipc/git';
import {
  EMPTY_HISTORY_FILTER,
  sanitizeHistoryFilter,
  sanitizeHistoryPresets,
  upsertHistoryPreset,
  validateHistoryDates,
  type HistoryFilterPreset,
} from './history-filters';

type RepositoryHistoryPrefs = { filter: HistoryFilter; presets: HistoryFilterPreset[] };
type HistoryPrefs = {
  repositories: Record<string, RepositoryHistoryPrefs>;
  setFilter: (path: string, filter: HistoryFilter) => void;
  savePreset: (path: string, name: string, filter: HistoryFilter) => void;
  removePreset: (path: string, id: string) => void;
};

const emptyRepositoryPrefs: RepositoryHistoryPrefs = { filter: EMPTY_HISTORY_FILTER, presets: [] };

export function sanitizeHistoryPreferences(value: unknown): Record<string, RepositoryHistoryPrefs> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([path, raw]) => {
    if (!path || !raw || typeof raw !== 'object') return [];
    const entry = raw as Record<string, unknown>;
    const filter = sanitizeHistoryFilter(entry.filter);
    return [[path, { filter: validateHistoryDates(filter) ? { ...filter, since: '', until: '' } : filter, presets: sanitizeHistoryPresets(entry.presets) }]];
  }));
}

export const useHistoryPrefs = create<HistoryPrefs>()(
  persist(
    set => ({
      repositories: {},
      setFilter: (path, filter) => set(state => ({
        repositories: {
          ...state.repositories,
          [path]: { ...(state.repositories[path] ?? emptyRepositoryPrefs), filter: sanitizeHistoryFilter(filter) },
        },
      })),
      savePreset: (path, name, filter) => set(state => {
        const entry = state.repositories[path] ?? emptyRepositoryPrefs;
        return { repositories: {
          ...state.repositories,
          [path]: { ...entry, presets: upsertHistoryPreset(entry.presets, name, filter, crypto.randomUUID()) },
        } };
      }),
      removePreset: (path, id) => set(state => {
        const entry = state.repositories[path] ?? emptyRepositoryPrefs;
        return { repositories: {
          ...state.repositories,
          [path]: { ...entry, presets: entry.presets.filter(preset => preset.id !== id) },
        } };
      }),
    }),
    {
      name: 'l8git-history-prefs.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ repositories: state.repositories }),
      merge: (persisted, current) => ({
        ...current,
        repositories: sanitizeHistoryPreferences((persisted as { repositories?: unknown } | undefined)?.repositories),
      }),
    },
  ),
);
