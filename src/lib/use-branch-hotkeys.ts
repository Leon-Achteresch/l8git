import { useHotkeys } from '@tanstack/react-hotkeys';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';

import { toastError } from './error-toast';
import { useHotkeyBindings } from './hotkey-prefs';
import { useRepoStore } from './repo-store';

type BranchFocusState = {
  path: string | null;
  name: string | null;
  focusBranch: (path: string, name: string) => void;
  blurBranch: (path: string, name: string) => void;
};

export const useBranchFocusStore = create<BranchFocusState>(set => ({
  path: null,
  name: null,
  focusBranch: (path, name) => set({ path, name }),
  blurBranch: (path, name) =>
    set(s => (s.path === path && s.name === name ? { path: null, name: null } : s)),
}));

export function useBranchSidebarHotkeys({
  path,
  enabled,
  onNewBranch,
}: {
  path: string;
  enabled: boolean;
  onNewBranch: () => void;
}) {
  const { t } = useTranslation();
  const bindings = useHotkeyBindings();
  const focusedPath = useBranchFocusStore(s => s.path);
  const focusedName = useBranchFocusStore(s => s.name);

  useEffect(
    () => () => {
      const state = useBranchFocusStore.getState();
      if (state.path === path) state.blurBranch(path, state.name ?? '');
    },
    [path]
  );

  const active = enabled && focusedPath === path;

  useHotkeys([
    {
      hotkey: bindings.branchNew,
      callback: () => onNewBranch(),
      options: { enabled: active, meta: { name: t('hotkeys.branchNew') } },
    },
    {
      hotkey: bindings.branchCheckout,
      callback: () => {
        if (!focusedName) return;
        const store = useRepoStore.getState();
        const branch = store.repos[path]?.branches.find(
          b => b.name === focusedName
        );
        if (!branch || branch.is_current) return;
        void (async () => {
          try {
            if (branch.is_remote) {
              const local =
                branch.name.slice(branch.name.indexOf('/') + 1) || 'branch';
              await store.checkoutBranch(path, local, {
                fromRemote: branch.name,
              });
            } else {
              await store.checkoutBranch(path, branch.name);
            }
          } catch (e) {
            toastError(String(e));
          }
        })();
      },
      options: {
        enabled: active && !!focusedName,
        meta: { name: t('hotkeys.branchCheckout') },
      },
    },
  ]);
}
