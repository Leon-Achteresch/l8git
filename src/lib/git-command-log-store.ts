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
  setPaused: (paused: boolean) => Promise<void>;
  push: (entry: GitCommandEntry) => void;
};

let loadVersion = 0;

export const useGitCommandLog = create<GitCommandLogState>((set, get) => ({
  entries: [],
  loading: false,
  paused: false,
  load: async (limit = GIT_COMMAND_LOG_CAP) => {
    const version = ++loadVersion;
    const before = new Set(get().entries);
    set({ loading: true });
    try {
      const entries = await invoke<GitCommandEntry[]>('git_command_log', {
        limit,
      });
      if (version !== loadVersion) return;
      // Preserve live events received after this snapshot request started.
      const live = get().entries.filter(entry => !before.has(entry));
      set({ entries: mergeCommandEntries(entries, live, Math.max(1, Math.min(limit, GIT_COMMAND_LOG_CAP))) });
    } finally {
      if (version === loadVersion) set({ loading: false });
    }
  },
  clear: async () => {
    await invoke('git_command_log_clear', {});
    loadVersion++;
    set({ entries: [], loading: false });
  },
  setPaused: async (paused) => {
    if (get().paused === paused) return;
    if (paused) {
      loadVersion++;
      set({ paused: true, loading: false });
    } else {
      set({ paused: false });
      await get().load();
    }
  },
  push: (entry) => {
    if (get().paused) return;
    set(({ entries }) => ({
      entries: entries.length === 0 || entry.seq > entries[0].seq
        ? [entry, ...entries.slice(0, GIT_COMMAND_LOG_CAP - 1)]
        : mergeCommandEntries(entries, [entry]),
    }));
  },
}));

export function subscribeGitCommandLog(onError: (error: unknown) => void) {
  let closed = false;
  let unlisten: (() => void) | undefined;
  async function connect() {
    try {
      const stop = await listen<GitCommandEntry>('git-command', event => {
        if (!closed) useGitCommandLog.getState().push(event.payload);
      });
      if (closed) {
        stop();
        return;
      }
      unlisten = stop;
      await invoke('git_command_log_live', { active: true });
    } catch (error) {
      if (!closed) onError(error);
    }
    if (!closed) await useGitCommandLog.getState().load();
  }
  void connect().catch(error => { if (!closed) onError(error); });
  return () => {
    closed = true;
    if (unlisten) {
      unlisten();
      void invoke('git_command_log_live', { active: false }).catch(() => {});
    }
  };
}
