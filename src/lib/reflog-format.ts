import { findBackendError, formatBackendError } from './backend-error';

export type ReflogEntry = {
  selector: string;
  hash: string;
  short_hash: string;
  action: string;
  subject: string;
  message: string;
  date: string;
};

export type UndoResult = {
  undone_action: string;
  from_hash: string;
  to_hash: string;
  head_name: string | null;
};

export type UndoPreview = {
  action: string;
  supported: boolean;
  target_hash: string;
  target_short_hash: string;
  target_subject: string;
  description_key: string;
  snapshot: string;
  current_hash: string;
  current_short_hash: string;
  head_name: string | null;
  mode: 'soft' | 'keep' | 'none';
};

export type RestoredBranch = {
  name: string;
  hash: string;
  short_hash: string;
};

export type ReflogResetMode = 'keep' | 'hard';


const KNOWN_DESCRIPTION_KEYS = new Set([
  'undo.action.merge',
  'undo.action.rebase',
  'undo.action.reset',
  'undo.action.cherryPick',
  'undo.action.am',
  'undo.action.revert',
  'undo.action.commit',
  'undo.action.amend',
  'undo.action.unsupported',
]);

export function undoDescriptionKey(key: string): string {
  return KNOWN_DESCRIPTION_KEYS.has(key) ? key : 'undo.action.unsupported';
}

export function parseUndoUnsupported(error: unknown): string | null {
  const { code, params } = findBackendError(error);
  return code === 'undo.unsupported' && typeof params.action === 'string' ? params.action.trim() : null;
}

export function parseLocalChangesBlock(error: unknown): string[] | null {
  const message = String(error);
  const marker = '__LOCAL_CHANGES_BLOCK__|';
  const index = message.indexOf(marker);
  if (index < 0) return null;
  const payload = message.slice(index + marker.length);
  const structured = parsePathList(payload);
  if (structured) return structured;
  return payload
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

function parsePathList(payload: string): string[] | null {
  try {
    const value: unknown = JSON.parse(payload);
    return Array.isArray(value) && value.every((path) => typeof path === 'string')
      ? value as string[]
      : null;
  } catch {
    return null;
  }
}

export type RecoveryError = { key: string; files: string[]; raw: string; stale: boolean };

const RECOVERY_CODES: Record<string, { key: string; stale: boolean }> = {
  'undo.invalidBranchName': { key: 'recovery.branchNameInvalid', stale: false },
  'undo.changed': { key: 'recovery.undoChanged', stale: true },
  'undo.reflogChanged': { key: 'recovery.resetChanged', stale: true },
  'undo.headChanged': { key: 'recovery.resetChanged', stale: true },
  'undo.pathsBlocked': { key: 'recovery.pathsBlocked', stale: false },
  'undo.localChanges': { key: 'recovery.trackedBlocked', stale: false },
};

export function recoveryError(error: unknown): RecoveryError {
  const { code, params } = findBackendError(error);
  const raw = formatBackendError(error);
  const known = code ? RECOVERY_CODES[code] : undefined;
  if (!known) return { key: 'recovery.operationFailed', files: [], raw, stale: false };
  const files = Array.isArray(params.files) ? params.files : [];
  return { ...known, files, raw };
}

/** Positional selectors alone do not identify an operation after the reflog moves. */
export function sameReflogEntry(a: ReflogEntry | undefined, b: ReflogEntry | undefined): boolean {
  return !!a && !!b && a.selector === b.selector && a.hash === b.hash && a.subject === b.subject && a.date === b.date;
}

export type ReflogActionTone = 'merge' | 'rebase' | 'reset' | 'commit' | 'pick' | 'checkout' | 'other';

export function reflogActionTone(action: string): ReflogActionTone {
  const value = action.toLowerCase();
  if (value.startsWith('merge')) return 'merge';
  if (value.startsWith('rebase')) return 'rebase';
  if (value.startsWith('reset')) return 'reset';
  if (value.startsWith('commit')) return 'commit';
  if (value.startsWith('cherry-pick') || value.startsWith('revert')) return 'pick';
  if (value.startsWith('checkout') || value.startsWith('branch') || value.startsWith('clone'))
    return 'checkout';
  return 'other';
}

const SELECTOR_PATTERN = /^HEAD@\{\d+\}$/;

export function isReflogSelector(selector: string): boolean {
  return SELECTOR_PATTERN.test(selector);
}
