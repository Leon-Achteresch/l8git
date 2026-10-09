import type { ChangeRow, FileDiffResponse } from '@/components/repo/commit/commit-panel-types';

export type ReviewedHunkAction = 'stage' | 'unstage' | 'discard';
export type ReviewedHunks = Readonly<{
  path: string;
  file: string;
  action: ReviewedHunkAction;
  patches: readonly string[];
  expectedFingerprint: string;
  expectedDiff: string;
}>;

/** Capture the displayed snapshot; a later confirmation must reuse this token. */
export function captureReviewedHunks(path: string, row: ChangeRow, diff: FileDiffResponse,
  action: ReviewedHunkAction, patches: readonly string[]): ReviewedHunks | null {
  const sector = action === 'unstage' ? 'staged' : 'unstaged';
  const expectedDiff = sector === 'staged' ? diff.staged : diff.unstaged;
  if (!path || !row.path || row.path !== row.entry.path || row.sector !== sector ||
    row.entry.embedded_repo || row.entry.binary || diff.is_binary || !expectedDiff?.trim() ||
    typeof diff.fingerprint !== 'string' || !diff.fingerprint.trim() ||
    !patches.length || patches.some(patch => !patch.trim())) return null;
  return Object.freeze({ path, file: row.path, action, expectedDiff,
    expectedFingerprint: diff.fingerprint, patches: Object.freeze([...patches]) });
}

type HunkInvoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;

/** One native apply validates the complete batch against its original snapshot. */
export async function applyReviewedHunks(plan: ReviewedHunks, invoke: HunkInvoke,
  currentPath: () => string | null): Promise<boolean> {
  if (currentPath() !== plan.path) return false;
  await invoke('git_apply_reviewed_hunks', { path: plan.path, file: plan.file, action: plan.action,
    patches: [...plan.patches], expectedFingerprint: plan.expectedFingerprint });
  return true;
}
