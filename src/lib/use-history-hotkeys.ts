import { useHotkeys } from '@tanstack/react-hotkeys';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { create } from 'zustand';

import { useHotkeyBindings } from './hotkey-prefs';
import { type Commit } from './repo-store';

export type HistorySelection = {
  path: string;
  hash: string;
  shortHash: string;
  subject: string;
  parentHash: string | null;
};

type HistorySelectionState = {
  selection: HistorySelection | null;
  setSelection: (selection: HistorySelection | null) => void;
  clearSelectionForPath: (path: string) => void;
};

export const useHistorySelectionStore = create<HistorySelectionState>(set => ({
  selection: null,
  setSelection: selection => set({ selection }),
  clearSelectionForPath: path =>
    set(s => (s.selection?.path === path ? { selection: null } : s)),
}));

export function useHistorySelection(): HistorySelection | null {
  return useHistorySelectionStore(s => s.selection);
}

export function useHistoryHotkeys({
  path,
  commit,
  enabled,
  onRebaseInteractive,
  onCheckoutChoice,
}: {
  path: string;
  commit: Commit | null;
  enabled: boolean;
  onRebaseInteractive: (baseHash: string) => void;
  onCheckoutChoice: (commit: Commit) => void;
}) {
  const { t } = useTranslation();
  const bindings = useHotkeyBindings();
  const setSelection = useHistorySelectionStore(s => s.setSelection);
  const clearSelectionForPath = useHistorySelectionStore(
    s => s.clearSelectionForPath
  );

  useEffect(() => {
    if (!enabled || !commit) {
      clearSelectionForPath(path);
      return;
    }
    setSelection({
      path,
      hash: commit.hash,
      shortHash: commit.short_hash,
      subject: commit.subject,
      parentHash: commit.parents[0] ?? null,
    });
  }, [enabled, commit, path, setSelection, clearSelectionForPath]);

  useEffect(
    () => () => {
      clearSelectionForPath(path);
    },
    [path, clearSelectionForPath]
  );

  const hasCommit = enabled && !!commit;
  const parentHash = commit?.parents[0] ?? null;

  useHotkeys([
    {
      hotkey: bindings.historyCheckoutCommit,
      callback: () => {
        if (!commit) return;
        onCheckoutChoice(commit);
      },
      options: {
        enabled: hasCommit,
        meta: { name: t('hotkeys.historyCheckoutCommit') },
      },
    },
    {
      hotkey: bindings.historyRebaseInteractive,
      callback: () => {
        if (!parentHash) return;
        onRebaseInteractive(parentHash);
      },
      options: {
        enabled: hasCommit && !!parentHash,
        meta: { name: t('hotkeys.historyRebaseInteractive') },
      },
    },
    {
      hotkey: bindings.historyCopyHash,
      callback: () => {
        if (!commit) return;
        void navigator.clipboard
          ?.writeText(commit.hash)
          .then(() =>
            toast.success(
              t('hotkeys.historyCopyHashToast', { hash: commit.short_hash })
            )
          )
          .catch(() => {});
      },
      options: {
        enabled: hasCommit,
        meta: { name: t('hotkeys.historyCopyHash') },
      },
    },
  ]);
}
