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
  return message
    .slice(index + marker.length)
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
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
