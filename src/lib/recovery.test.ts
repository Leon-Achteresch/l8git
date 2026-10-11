import { describe, expect, it } from 'vitest';
import { parseLocalChangesBlock, parseRecoveryPathsBlock, recoveryError, sameReflogEntry, type ReflogEntry } from './reflog-format';

const entry: ReflogEntry = { selector: 'HEAD@{0}', hash: 'abc', short_hash: 'abc', action: 'commit', subject: 'commit: Hello', message: 'Hello', date: '2026-10-08T12:00:00+02:00' };

describe('recovery path feedback', () => {
  it('preserves commas, whitespace and line breaks from structured Git paths', () => {
    const files = [' spaced, name.txt', 'line\nbreak.txt', '日本語.txt'];
    expect(parseLocalChangesBlock(`__LOCAL_CHANGES_BLOCK__|${JSON.stringify(files)}`)).toEqual(files);
    expect(parseRecoveryPathsBlock(`__RECOVERY_PATHS_BLOCK__|${JSON.stringify(files)}`)).toEqual(files);
  });
  it('remains compatible with legacy blocked-file messages', () => {
    expect(parseLocalChangesBlock('Error: __LOCAL_CHANGES_BLOCK__|a.txt,b/c.txt')).toEqual(['a.txt', 'b/c.txt']);
    expect(parseLocalChangesBlock('__LOCAL_CHANGES_BLOCK__|')).toEqual([]);
  });
  it('does not mistake arbitrary JSON or malformed payloads for paths', () => {
    expect(parseRecoveryPathsBlock('ordinary error')).toBeNull();
    expect(parseRecoveryPathsBlock('__RECOVERY_PATHS_BLOCK__|[7]')).toEqual([]);
    expect(parseRecoveryPathsBlock('__RECOVERY_PATHS_BLOCK__|broken')).toEqual([]);
  });
  it('distinguishes a stale confirmation from a retryable conflict', () => {
    expect(recoveryError('__UNDO_CHANGED__')).toMatchObject({ key: 'recovery.undoChanged', stale: true });
    for (const marker of ['__REFLOG_CHANGED__', '__HEAD_CHANGED__']) {
      expect(recoveryError(marker)).toMatchObject({ key: 'recovery.resetChanged', stale: true });
    }
    expect(recoveryError('__RECOVERY_PATHS_BLOCK__|["notes.txt"]')).toMatchObject({ key: 'recovery.pathsBlocked', files: ['notes.txt'], stale: false });
    expect(recoveryError('__LOCAL_CHANGES_BLOCK__|a.txt')).toMatchObject({ key: 'recovery.trackedBlocked', files: ['a.txt'], stale: false });
  });
  it('preserves unknown errors for inspection and copying', () => {
    expect(recoveryError('fatal: disk full')).toEqual({ key: 'recovery.operationFailed', files: [], raw: 'fatal: disk full', stale: false });
  });
  it('provides actionable validation for rescue branch names', () => {
    expect(recoveryError('__INVALID_RECOVERY_BRANCH__')).toMatchObject({ key: 'recovery.branchNameInvalid', stale: false });
  });
});

describe('reflog pagination anchors', () => {
  it('identifies operations using content and position, including repeated commit hashes', () => {
    expect(sameReflogEntry(entry, { ...entry })).toBe(true);
    expect(sameReflogEntry(entry, { ...entry, selector: 'HEAD@{1}' })).toBe(false);
    expect(sameReflogEntry(entry, { ...entry, subject: 'reset: moving to abc' })).toBe(false);
    expect(sameReflogEntry(entry, { ...entry, date: '2026-10-08T13:00:00+02:00' })).toBe(false);
    expect(sameReflogEntry(entry, undefined)).toBe(false);
  });
});
