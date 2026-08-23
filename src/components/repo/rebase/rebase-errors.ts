import i18n from '@/lib/i18n';
import { toastError } from '@/lib/error-toast';

const LOCAL_CHANGES_MARKER = '__LOCAL_CHANGES_BLOCK__|';

export function isLocalChangesBlock(err: unknown): boolean {
  return String(err).includes(LOCAL_CHANGES_MARKER);
}

export function localChangesFiles(err: unknown): string[] {
  const raw = String(err);
  const idx = raw.indexOf(LOCAL_CHANGES_MARKER);
  if (idx < 0) return [];
  return raw
    .slice(idx + LOCAL_CHANGES_MARKER.length)
    .split(',')
    .map(f => f.trim())
    .filter(f => f.length > 0);
}

const PATTERNS: { re: RegExp; key: string }[] = [
  { re: /^A rebase is already in progress/, key: 'rebase.errors.alreadyInProgress' },
  { re: /^No rebase in progress/, key: 'rebase.errors.notInProgress' },
  { re: /^Upstream must not be empty/, key: 'rebase.errors.upstreamEmpty' },
  { re: /^Base must not be empty/, key: 'rebase.errors.baseEmpty' },
  { re: /^The todo list must not be empty/, key: 'rebase.errors.todoEmpty' },
  { re: /^There are no commits between/, key: 'rebase.errors.noCommits' },
  { re: /^Nothing to do: every commit was dropped/, key: 'rebase.errors.allDropped' },
  { re: /^Nothing is staged for the fixup commit/, key: 'rebase.errors.nothingStaged' },
  {
    re: /^The first commit cannot be squashed/,
    key: 'rebase.errors.firstSquash',
  },
];

const VALUE_PATTERNS: { re: RegExp; key: string }[] = [
  { re: /^Unknown upstream: (.+)$/, key: 'rebase.errors.unknownUpstream' },
  { re: /^Unknown onto target: (.+)$/, key: 'rebase.errors.unknownOnto' },
  { re: /^Unknown base commit: (.+)$/, key: 'rebase.errors.unknownBase' },
  { re: /^Unknown rebase action: (.+)$/, key: 'rebase.errors.unknownAction' },
  { re: /^Unknown commit: (.+)$/, key: 'rebase.errors.unknownCommit' },
  {
    re: /^Commit (\S+) is not part of the rebase range/,
    key: 'rebase.errors.notInRange',
  },
  {
    re: /^Commit (\S+) appears more than once/,
    key: 'rebase.errors.duplicate',
  },
  {
    re: /^Fixup commit (\S+) was created, but the autosquash rebase failed/,
    key: 'rebase.errors.fixupAutosquashFailed',
  },
];

export function describeRebaseError(err: unknown): string {
  const raw = String(err).replace(/^Error:\s*/, '').trim();
  if (isLocalChangesBlock(err)) {
    const files = localChangesFiles(err);
    return i18n.t('rebase.errors.localChanges', {
      count: files.length,
      files: files.slice(0, 8).join(', '),
    });
  }
  for (const p of PATTERNS) {
    if (p.re.test(raw)) return i18n.t(p.key);
  }
  for (const p of VALUE_PATTERNS) {
    const m = p.re.exec(raw);
    if (m) return i18n.t(p.key, { value: m[1] });
  }
  return raw;
}

export function toastRebaseError(err: unknown) {
  toastError(describeRebaseError(err));
}
