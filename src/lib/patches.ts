import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { create } from 'zustand';
import i18n from '@/lib/i18n';
import { useRepoStore } from '@/lib/repo-store';

export type AmState = {
  in_progress: boolean;
  subject: string | null;
  step: number | null;
  total: number | null;
  conflicted_paths: string[];
};

export type PatchCheck = { mailbox: boolean; applies: boolean | null; message: string };

const IDLE: AmState = { in_progress: false, subject: null, step: null, total: null, conflicted_paths: [] };

export const usePatchStore = create<{ amState: Record<string, AmState> }>(() => ({ amState: {} }));

/** The history lists newest first; patches must be numbered oldest first so `git am` replays them in order. */
export function oldestFirst(hashes: Iterable<string>, newestFirst: readonly { hash: string }[]): string[] {
  const index = new Map(newestFirst.map((c, i) => [c.hash, i] as const));
  return [...hashes].sort((a, b) => (index.get(b) ?? -1) - (index.get(a) ?? -1));
}

/** Native file dialogs only reach this machine's disk, so patch files are a desktop-only feature. */
export const patchFilesSupported = () => isTauri();

export async function reloadAmState(path: string): Promise<AmState> {
  const next = await invoke<AmState>('git_am_state', { path }).catch(() => IDLE);
  const cur = usePatchStore.getState().amState[path];
  if (cur && JSON.stringify(cur) === JSON.stringify(next)) return cur;
  usePatchStore.setState(s => ({ amState: { ...s.amState, [path]: next } }));
  return next;
}

async function refreshRepo(path: string) {
  const repo = useRepoStore.getState();
  await Promise.all([repo.reload(path), repo.reloadStatus(path), reloadAmState(path)]);
}

async function withRefresh<T>(path: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } finally {
    await refreshRepo(path);
  }
}

/** Returns the written files, or null when the folder picker was cancelled. */
export async function exportCommitPatches(path: string, commits: string[]): Promise<string[] | null> {
  const outDir = await open({ directory: true, multiple: false, title: i18n.t('patches.pickFolder') });
  if (typeof outDir !== 'string') return null;
  return invoke<string[]>('git_format_patch', { path, commits, outDir });
}

/** Returns the written file, or null when the save dialog was cancelled. */
export async function exportChangesPatch(path: string, staged: boolean): Promise<string | null> {
  const dest = await save({
    defaultPath: staged ? 'staged-changes.patch' : 'changes.patch',
    filters: [{ name: 'Patch', extensions: ['patch', 'diff'] }],
  });
  if (!dest) return null;
  await invoke<number>('git_export_diff_patch', { path, staged, dest });
  return dest;
}

export async function pickPatchFiles(): Promise<string[]> {
  const picked = await open({
    multiple: true,
    directory: false,
    filters: [{ name: 'Patch', extensions: ['patch', 'diff', 'mbox', 'eml'] }, { name: '*', extensions: ['*'] }],
  });
  if (!picked) return [];
  return (Array.isArray(picked) ? picked : [picked]).sort();
}

export const checkPatches = (path: string, files: string[], threeWay: boolean) =>
  invoke<PatchCheck>('git_patch_check', { path, files, threeWay });

export const applyPatches = (path: string, files: string[], threeWay: boolean) =>
  withRefresh(path, () => invoke<string>('git_patch_apply', { path, files, threeWay }));

export const amContinue = (path: string) => withRefresh(path, () => invoke<string>('git_am_continue', { path }));
export const amSkip = (path: string) => withRefresh(path, () => invoke<string>('git_am_skip', { path }));
export const amAbort = (path: string) => withRefresh(path, () => invoke<string>('git_am_abort', { path }));
