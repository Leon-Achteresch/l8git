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

export const UNDO_UNSUPPORTED = '__UNDO_UNSUPPORTED__';

const KNOWN_DESCRIPTION_KEYS = new Set([
  'undo.action.merge',
  'undo.action.rebase',
  'undo.action.reset',
  'undo.action.cherryPick',
  'undo.action.revert',
  'undo.action.commit',
  'undo.action.amend',
  'undo.action.unsupported',
]);

export function undoDescriptionKey(key: string): string {
  return KNOWN_DESCRIPTION_KEYS.has(key) ? key : 'undo.action.unsupported';
}

export function parseUndoUnsupported(error: unknown): string | null {
  const message = String(error);
  const index = message.indexOf(`${UNDO_UNSUPPORTED}|`);
  if (index < 0) return null;
  return message.slice(index + UNDO_UNSUPPORTED.length + 1).trim();
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

export function parseRecoveryPathsBlock(error: unknown): string[] | null {
  const raw = String(error);
  const marker = '__RECOVERY_PATHS_BLOCK__|';
  const index = raw.indexOf(marker);
  return index < 0 ? null : parsePathList(raw.slice(index + marker.length)) ?? [];
}

export function recoveryError(error: unknown): RecoveryError {
  const raw = String(error);
  if (raw.includes('__INVALID_RECOVERY_BRANCH__')) return { key: 'recovery.branchNameInvalid', files: [], raw, stale: false };
  const changed = ['__UNDO_CHANGED__', '__REFLOG_CHANGED__', '__HEAD_CHANGED__'];
  if (changed.some((marker) => raw.includes(marker))) {
    return { key: raw.includes('__UNDO_CHANGED__') ? 'recovery.undoChanged' : 'recovery.resetChanged', files: [], raw, stale: true };
  }
  const collisions = parseRecoveryPathsBlock(error);
  if (collisions) {
    return { key: 'recovery.pathsBlocked', files: collisions, raw, stale: false };
  }
  const files = parseLocalChangesBlock(error);
  if (files) return { key: 'recovery.trackedBlocked', files, raw, stale: false };
  return { key: 'recovery.operationFailed', files: [], raw, stale: false };
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
