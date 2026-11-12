import { describe, expect, it } from 'vitest';
import { parseLocalChangesBlock, recoveryError, sameReflogEntry, type ReflogEntry } from './reflog-format';

const entry: ReflogEntry = { selector: 'HEAD@{0}', hash: 'abc', short_hash: 'abc', action: 'commit', subject: 'commit: Hello', message: 'Hello', date: '2026-10-08T12:00:00+02:00' };

const coded = (code: string, message: string, params?: Record<string, string | string[]>) =>
  `\u001f${message}\u001fl8e:${JSON.stringify(params ? { code, params } : { code })}\u001f`;

describe('recovery path feedback', () => {
  it('preserves commas, whitespace and line breaks from structured Git paths', () => {
    const files = [' spaced, name.txt', 'line\nbreak.txt', '日本語.txt'];
    expect(parseLocalChangesBlock(`__LOCAL_CHANGES_BLOCK__|${JSON.stringify(files)}`)).toEqual(files);
    expect(recoveryError(coded('undo.pathsBlocked', 'Blocked', { files })).files).toEqual(files);
  });
  it('remains compatible with legacy blocked-file messages', () => {
    expect(parseLocalChangesBlock('Error: __LOCAL_CHANGES_BLOCK__|a.txt,b/c.txt')).toEqual(['a.txt', 'b/c.txt']);
    expect(parseLocalChangesBlock('__LOCAL_CHANGES_BLOCK__|')).toEqual([]);
  });
  it('distinguishes a stale confirmation from a retryable conflict', () => {
    expect(recoveryError(coded('undo.changed', 'Changed'))).toMatchObject({ key: 'recovery.undoChanged', stale: true });
    for (const code of ['undo.reflogChanged', 'undo.headChanged']) {
      expect(recoveryError(coded(code, 'Changed'))).toMatchObject({ key: 'recovery.resetChanged', stale: true });
    }
    expect(recoveryError(coded('undo.pathsBlocked', 'Blocked', { files: ['notes.txt'] }))).toMatchObject({ key: 'recovery.pathsBlocked', files: ['notes.txt'], stale: false });
    expect(recoveryError(coded('undo.localChanges', 'Dirty', { files: ['a.txt'] }))).toMatchObject({ key: 'recovery.trackedBlocked', files: ['a.txt'], stale: false });
  });
  it('no longer treats legacy prose sentinels as recovery states', () => {
    expect(recoveryError('__UNDO_CHANGED__')).toMatchObject({ key: 'recovery.operationFailed', stale: false });
  });
  it('preserves unknown errors for inspection and copying', () => {
    expect(recoveryError('fatal: disk full')).toEqual({ key: 'recovery.operationFailed', files: [], raw: 'fatal: disk full', stale: false });
  });
  it('shows other coded errors as their message, never as a raw code', () => {
    expect(recoveryError(coded('undo.nothingToUndo', 'There is nothing to undo.')).raw).not.toContain('l8e:');
  });
  it('provides actionable validation for rescue branch names', () => {
    expect(recoveryError(coded('undo.invalidBranchName', 'Invalid'))).toMatchObject({ key: 'recovery.branchNameInvalid', stale: false });
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
