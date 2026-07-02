import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const MAX_ENTRIES = 200;
const MAX_LENGTH = 500;

export type CommandEntry = {
  cmd: string;
  count: number;
  lastUsedAt: number;
};

type CommandHistoryState = {
  byPath: Record<string, CommandEntry[]>;
  record: (path: string, cmd: string) => void;
  remove: (path: string, cmd: string) => void;
  clear: (path: string) => void;
};

export const useCommandHistory = create<CommandHistoryState>()(
  persist(
    (set) => ({
      byPath: {},
      record: (path, cmd) => {
        const trimmed = cmd.trim().slice(0, MAX_LENGTH);
        if (!trimmed) return;
        set((s) => {
          const list = s.byPath[path] ?? [];
          const existing = list.find((e) => e.cmd === trimmed);
          const entry: CommandEntry = {
            cmd: trimmed,
            count: (existing?.count ?? 0) + 1,
            lastUsedAt: Date.now(),
          };
          const next = [entry, ...list.filter((e) => e.cmd !== trimmed)].slice(
            0,
            MAX_ENTRIES,
          );
          return { byPath: { ...s.byPath, [path]: next } };
        });
      },
      remove: (path, cmd) =>
        set((s) => ({
          byPath: {
            ...s.byPath,
            [path]: (s.byPath[path] ?? []).filter((e) => e.cmd !== cmd),
          },
        })),
      clear: (path) =>
        set((s) => {
          const { [path]: _removed, ...byPath } = s.byPath;
          return { byPath };
        }),
    }),
    {
      name: 'l8git-terminal-history',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function recordCommand(path: string, cmd: string): void {
  useCommandHistory.getState().record(path, cmd);
}
