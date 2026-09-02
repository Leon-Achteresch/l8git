import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { create } from 'zustand';

import {
  GIT_COMMAND_LOG_CAP,
  mergeCommandEntries,
  type GitCommandEntry,
} from '@/lib/git-command-log';

export type { GitCommandEntry };

type GitCommandLogState = {
  entries: GitCommandEntry[];
  loading: boolean;
  paused: boolean;
  load: (limit?: number) => Promise<void>;
  clear: () => Promise<void>;
  setPaused: (paused: boolean) => void;
  push: (entry: GitCommandEntry) => void;
};

export const useGitCommandLog = create<GitCommandLogState>((set, get) => ({
  entries: [],
  loading: false,
  paused: false,
  load: async (limit = GIT_COMMAND_LOG_CAP) => {
    set({ loading: true });
    try {
      const entries = await invoke<GitCommandEntry[]>('git_command_log', {
        limit,
      });
      set({ entries: mergeCommandEntries([], entries) });
    } finally {
      set({ loading: false });
    }
  },
  clear: async () => {
    await invoke('git_command_log_clear', {});
    set({ entries: [] });
  },
  setPaused: (paused) => set({ paused }),
  push: (entry) => {
    if (get().paused) return;
    set((s) => ({ entries: mergeCommandEntries(s.entries, [entry]) }));
  },
}));

let listenerAttached = false;

export function ensureGitCommandLogListener() {
  void invoke('git_command_log_live', { active: true }).catch(() => {});
  if (listenerAttached) return;
  listenerAttached = true;
  void listen<GitCommandEntry>('git-command', (event) => {
    useGitCommandLog.getState().push(event.payload);
  });
}

export function releaseGitCommandLogListener() {
  void invoke('git_command_log_live', { active: false }).catch(() => {});
}
