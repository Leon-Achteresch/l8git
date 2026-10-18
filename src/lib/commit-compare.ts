import { invoke } from '@tauri-apps/api/core';
import type { Commit } from './repo-store';

export type CommitCompareMode = 'direct' | 'merge-base';
export type CommitCompareRefs = { base: string; head: string; mode: CommitCompareMode };
export type CommitCompareFileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T';
export type CommitCompareFile = {
  path: string;
  previous_path: string | null;
  status: CommitCompareFileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
};
export type CommitComparison = CommitCompareRefs & {
  base_hash: string;
  head_hash: string;
  merge_base: string | null;
  ahead: number;
  behind: number;
  files: CommitCompareFile[];
  additions: number;
  deletions: number;
  total_files: number;
  truncated: boolean;
};
export type CommitCompareDiff = { patch: string; truncated: boolean; binary: boolean };
export type CommitCompareFileSort = 'path' | 'changes' | 'status';

export const COMPARE_FILE_STATUS_KEYS: Record<CommitCompareFileStatus, string> = {
  A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied', T: 'typeChanged',
};

export function validateCompareRefs(refs: Pick<CommitCompareRefs, 'base' | 'head'>): 'requiredRefs' | 'invalidRef' | null {
  const values = [refs.base.trim(), refs.head.trim()];
  if (values.some(value => !value)) return 'requiredRefs';
  if (values.some(value => value.startsWith('-') || /[\x00-\x1f\x7f]/.test(value))) return 'invalidRef';
  return null;
}

/** The list is in Git history order: newest first. Never mutate it to compare. */
export function comparisonRefsFromSelection(commits: Pick<Commit, 'hash'>[]): CommitCompareRefs | null {
  if (commits.length !== 2 || commits[0].hash === commits[1].hash) return null;
  return { base: commits[1].hash, head: commits[0].hash, mode: 'direct' };
}

/** Case-insensitive substring match; an empty query matches every path. */
export function pathMatchesQuery(path: string | null | undefined, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || !!path?.toLocaleLowerCase().includes(needle);
}

export function filterCompareFiles(files: CommitCompareFile[], query: string, status: CommitCompareFileStatus | 'all', sort: CommitCompareFileSort, reviewed: ReadonlySet<string> = new Set(), hideReviewed = false): CommitCompareFile[] {
  return files.filter(file =>
    (status === 'all' || file.status === status)
    && (!hideReviewed || !reviewed.has(file.path))
    && (pathMatchesQuery(file.path, query) || pathMatchesQuery(file.previous_path, query)),
  ).sort((a, b) => {
    if (sort === 'changes') {
      const size = b.additions + b.deletions - a.additions - a.deletions;
      if (size) return size;
    }
    if (sort === 'status') {
      const order = a.status.localeCompare(b.status);
      if (order) return order;
    }
    return a.path.localeCompare(b.path);
  });
}

export function nextCompareFile(files: Pick<CommitCompareFile, 'path'>[], selectedPath: string | null, direction: -1 | 1): string | null {
  if (!files.length) return null;
  const current = files.findIndex(file => file.path === selectedPath);
  if (current < 0) return files[direction === 1 ? 0 : files.length - 1].path;
  return files[Math.max(0, Math.min(files.length - 1, current + direction))].path;
}

export function comparisonSnapshotKey(comparison: Pick<CommitComparison, 'base_hash' | 'head_hash' | 'mode'>): string {
  return JSON.stringify([comparison.base_hash, comparison.head_hash, comparison.mode]);
}

export function comparisonDiffRefs(comparison: CommitComparison): CommitCompareRefs {
  // Pin every file to the snapshot returned by the summary, even if a branch
  // moves while the review dialog remains open.
  return { base: comparison.base_hash, head: comparison.head_hash, mode: comparison.mode };
}

export function comparisonEffectiveBase(comparison: Pick<CommitComparison, 'base_hash' | 'merge_base' | 'mode'>): string {
  return comparison.mode === 'merge-base' ? comparison.merge_base ?? comparison.base_hash : comparison.base_hash;
}

export function comparisonErrorKey(error: string): 'noCommonAncestor' | 'invalidMode' | 'fileNotChanged' | null {
  if (error.includes('__COMPARE_NO_COMMON_ANCESTOR__')) return 'noCommonAncestor';
  if (error.includes('__COMPARE_INVALID_MODE__')) return 'invalidMode';
  if (error.includes('__COMPARE_FILE_NOT_CHANGED__')) return 'fileNotChanged';
  return null;
}

export function readCommitComparison(path: string, refs: CommitCompareRefs): Promise<CommitComparison> {
  return invoke('repo_compare_commits', { path, ...refs });
}

export function readCommitCompareDiff(path: string, comparison: CommitComparison, file: string): Promise<CommitCompareDiff> {
  const previousFile = comparison.files.find(entry => entry.path === file)?.previous_path ?? null;
  return invoke('repo_compare_file_diff', { path, ...comparisonDiffRefs(comparison), file, previousFile });
}
