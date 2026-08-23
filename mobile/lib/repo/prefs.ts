import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

const STORAGE_KEY = 'l8git.workspacePrefs.v1';

export type PullStrategy = 'merge' | 'rebase' | 'ff-only' | 'autostash';

export const PULL_STRATEGIES: readonly PullStrategy[] = [
  'merge',
  'rebase',
  'ff-only',
  'autostash',
];

export const PULL_STRATEGY_LABEL: Record<PullStrategy, string> = {
  merge: 'Merge',
  rebase: 'Rebase',
  'ff-only': 'Fast-forward only',
  autostash: 'Autostash',
};

export type WorkspaceDefaults = {
  pullStrategy: PullStrategy;
  fetchPruneBranches: boolean;
  fetchPruneTags: boolean;
  pushNoVerify: boolean;
};

const DEFAULTS: WorkspaceDefaults = {
  pullStrategy: 'merge',
  fetchPruneBranches: false,
  fetchPruneTags: false,
  pushNoVerify: false,
};

interface PrefsState extends WorkspaceDefaults {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<WorkspaceDefaults>) => void;
}

function parse(raw: string | null): Partial<WorkspaceDefaults> {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as Partial<WorkspaceDefaults>;
  } catch {
    return {};
  }
}

export const useWorkspaceDefaults = create<PrefsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) {
      return;
    }
    const raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    set({ ...DEFAULTS, ...parse(raw), hydrated: true });
  },

  update: (patch) => {
    set(patch);
    const { pullStrategy, fetchPruneBranches, fetchPruneTags, pushNoVerify } = get();
    void AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pullStrategy, fetchPruneBranches, fetchPruneTags, pushNoVerify })
    ).catch(() => undefined);
  },
}));

export function useHydratedWorkspaceDefaults(): WorkspaceDefaults {
  React.useEffect(() => {
    void useWorkspaceDefaults.getState().hydrate();
  }, []);
  return useWorkspaceDefaults(
    useShallow((state) => ({
      pullStrategy: state.pullStrategy,
      fetchPruneBranches: state.fetchPruneBranches,
      fetchPruneTags: state.fetchPruneTags,
      pushNoVerify: state.pushNoVerify,
    }))
  );
}
