import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildHunkPatch,
  buildPatchesForDiscard,
  buildPatchesForSelection,
  parseDiffWithHunks,
  parseUnifiedDiff,
  type ParsedDiff,
} from './unified-diff';

const scratch: string[] = [];
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

function repository(original: string | null, working: string | null, file = 'selected.txt') {
  const path = mkdtempSync(join(tmpdir(), 'l8git-patch-'));
  scratch.push(path);
  const git = (...args: string[]) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  writeFileSync(join(path, 'untouched.txt'), 'untouched\n');
  if (original !== null) writeFileSync(join(path, file), original);
  git('add', '.');
  git('commit', '-qm', 'base');
  if (working === null) rmSync(join(path, file));
  else writeFileSync(join(path, file), working);
  if (original === null) git('add', '-N', '--', file);
  const diff = (staged = false) => git('diff', '--no-ext-diff', '--no-color', '--no-renames', ...(staged ? ['--cached'] : []), '--', file);
  const index = () => {
    const result = spawnSync('git', ['-C', path, 'show', `:${file}`]);
    return result.status === 0 ? result.stdout : null;
  };
  const contents = () => existsSync(join(path, file)) ? readFileSync(join(path, file)) : null;
  const apply = (patches: string[], flags: string[] = []) => {
    expect(patches.length).toBeGreaterThan(0);
    for (const patch of patches) {
      // The native review guard checks both directions: implicit renames can
      // otherwise report only their destination in the forward numstat.
      for (const reverse of [false, true]) {
        const numstat = execFileSync('git', ['-C', path, 'apply', '--numstat', '-z', ...(reverse ? ['--reverse'] : [])], { input: patch, encoding: 'utf8' });
        const paths = numstat.split('\0').filter(Boolean).map(record => record.slice(record.indexOf('\t', record.indexOf('\t') + 1) + 1));
        expect(paths).toEqual([file]);
      }
      execFileSync('git', ['-C', path, 'apply', '--whitespace=nowarn', ...flags], { input: patch, stdio: ['pipe', 'pipe', 'pipe'] });
    }
    expect(readFileSync(join(path, 'untouched.txt'), 'utf8')).toBe('untouched\n');
    expect(git('show', ':untouched.txt')).toBe('untouched\n');
  };
  return { path, file, git, diff, index, contents, apply };
}

function selected(parsed: ParsedDiff, kind?: 'add' | 'del', text?: string) {
  const keys = new Set<string>();
  parsed.hunks.forEach((hunk, hunkIdx) => hunk.lines.forEach((line, lineIdx) => {
    if ((line.kind === 'add' || line.kind === 'del') && (!kind || line.kind === kind) && (text === undefined || line.text === text)) {
      keys.add(`${hunkIdx}:${lineIdx}`);
    }
  }));
  return keys;
}

function bytes(value: string | null) {
  return value === null ? null : Buffer.from(value);
}

describe('real Git patch application', () => {
  it.each(['add', 'del', undefined] as const)('stages a %s replacement selection without changing the worktree', kind => {
    const original = 'keep\nold\nend\n';
    const working = 'keep\nnew\nend\n';
    const repo = repository(original, working);
    const parsed = parseDiffWithHunks(repo.diff());
    repo.apply(buildPatchesForSelection(parsed, selected(parsed, kind)), ['--cached']);
    const expected = kind === 'add' ? 'keep\nold\nnew\nend\n' : kind === 'del' ? 'keep\nend\n' : working;
    expect(repo.index()).toEqual(bytes(expected));
    expect(repo.contents()).toEqual(bytes(working));
  });

  it.each(['add', 'del', undefined] as const)('unstages a %s replacement selection while retaining unselected changes', kind => {
    const original = 'keep\nold\nend\n';
    const working = 'keep\nnew\nend\n';
    const repo = repository(original, working);
    repo.git('add', '--', repo.file);
    const parsed = parseDiffWithHunks(repo.diff(true));
    repo.apply(buildPatchesForSelection(parsed, selected(parsed, kind), true), ['--cached', '--reverse']);
    const expected = kind === 'add' ? 'keep\nend\n' : kind === 'del' ? 'keep\nold\nnew\nend\n' : original;
    expect(repo.index()).toEqual(bytes(expected));
    expect(repo.contents()).toEqual(bytes(working));
  });

  it.each([
    ['new', null, 'first\nsecond\n', 'add', 'first', 'first\n'],
    ['deleted', 'first\nsecond\n', null, 'del', 'first', 'second\n'],
  ] as const)('stages part of a %s file without losing unselected lines', (_name, original, working, kind, text, expected) => {
    const repo = repository(original, working);
    const parsed = parseDiffWithHunks(repo.diff());
    repo.apply(buildPatchesForSelection(parsed, selected(parsed, kind, text)), ['--cached']);
    expect(repo.index()).toEqual(bytes(expected));
    expect(repo.contents()).toEqual(bytes(working));
  });

  it.each([
    ['new', null, 'first\nsecond\n', 'add', 'first', 'second\n'],
    ['deleted', 'first\nsecond\n', null, 'del', 'first', 'first\n'],
  ] as const)('unstages part of a %s file without losing unselected lines', (_name, original, working, kind, text, expected) => {
    const repo = repository(original, working);
    repo.git('add', '--', repo.file);
    const parsed = parseDiffWithHunks(repo.diff(true));
    repo.apply(buildPatchesForSelection(parsed, selected(parsed, kind, text), true), ['--cached', '--reverse']);
    expect(repo.index()).toEqual(bytes(expected));
    expect(repo.contents()).toEqual(bytes(working));
  });

  it.each([
    ['new', null, 'first\nsecond\n', 'add', 'first', 'second\n'],
    ['deleted', 'first\nsecond\n', null, 'del', 'first', 'first\n'],
  ] as const)('discards part of a %s file and leaves the index unchanged', (_name, original, working, kind, text, expected) => {
    const repo = repository(original, working);
    const before = repo.index();
    const parsed = parseDiffWithHunks(repo.diff());
    repo.apply(buildPatchesForDiscard(parsed, selected(parsed, kind, text)));
    expect(repo.contents()).toEqual(bytes(expected));
    expect(repo.index()).toEqual(before);
  });

  it.each([
    ['new', null, 'first\nsecond'],
    ['deleted', 'first\nsecond', null],
  ] as const)('stages, unstages, and discards a complete %s file with no final newline', (_name, original, working) => {
    const repo = repository(original, working);
    const parsed = parseDiffWithHunks(repo.diff());
    repo.apply([buildHunkPatch(parsed, 0)], ['--cached']);
    expect(repo.index()).toEqual(bytes(working));
    const staged = parseDiffWithHunks(repo.diff(true));
    repo.apply([buildHunkPatch(staged, 0)], ['--cached', '--reverse']);
    expect(repo.index()).toEqual(bytes(original));
    repo.apply(buildPatchesForDiscard(parsed, selected(parsed)));
    expect(repo.contents()).toEqual(bytes(original));
  });

  it.each(['stage', 'unstage', 'discard'] as const)('preserves CRLF bytes during full and partial %s', action => {
    const original = 'keep\r\nold\r\nend\r\n';
    const working = 'keep\r\nnew\r\nend\r\n';
    for (const partial of [false, true]) {
      const repo = repository(original, working);
      if (action === 'unstage') repo.git('add', '--', repo.file);
      const parsed = parseDiffWithHunks(repo.diff(action === 'unstage'));
      const keys = selected(parsed, partial ? 'del' : undefined);
      if (action === 'discard') repo.apply(buildPatchesForDiscard(parsed, keys));
      else repo.apply(buildPatchesForSelection(parsed, keys, action === 'unstage'), ['--cached', ...(action === 'unstage' ? ['--reverse'] : [])]);
      const expected = partial ? action === 'stage' ? 'keep\r\nend\r\n' : 'keep\r\nold\r\nnew\r\nend\r\n' : action === 'stage' ? working : original;
      expect(action === 'discard' ? repo.contents() : repo.index()).toEqual(bytes(expected));
    }
  });

  it.each(['new', 'deleted'] as const)('preserves the remaining EOF bytes in partial %s file operations', name => {
    const original = name === 'new' ? null : 'first\nsecond';
    const working = name === 'new' ? 'first\nsecond' : null;
    const repo = repository(original, working);
    const parsed = parseDiffWithHunks(repo.diff());
    const kind = name === 'new' ? 'add' : 'del';
    repo.apply(buildPatchesForSelection(parsed, selected(parsed, kind, 'first')), ['--cached']);
    expect(repo.index()).toEqual(bytes(name === 'new' ? 'first\n' : 'second'));
    repo.apply(buildPatchesForDiscard(parsed, selected(parsed, kind, name === 'new' ? 'first' : 'second')));
    expect(repo.contents()).toEqual(bytes('second'));
  });

  it.each(['new', 'new\n'] as const)('restores an EOF line before unselected %j without concatenating lines', changed => {
    const repo = repository('keep\nold', `keep\n${changed}`);
    const parsed = parseDiffWithHunks(repo.diff());
    repo.apply(buildPatchesForDiscard(parsed, selected(parsed, 'del')));
    expect(repo.contents()).toEqual(bytes(`keep\nold\n${changed}`));
    expect(repo.index()).toEqual(bytes('keep\nold'));
  });

  it.each(['stage', 'unstage'] as const)('preserves an unselected EOF payload when partially %s-ing a replacement', action => {
    const repo = repository('keep\nold', 'keep\nnew');
    if (action === 'unstage') repo.git('add', '--', repo.file);
    const parsed = parseDiffWithHunks(repo.diff(action === 'unstage'));
    const keys = selected(parsed, action === 'stage' ? 'add' : 'del');
    repo.apply(buildPatchesForSelection(parsed, keys, action === 'unstage'), ['--cached', ...(action === 'unstage' ? ['--reverse'] : [])]);
    expect(repo.index()).toEqual(bytes('keep\nold\nnew'));
    expect(repo.contents()).toEqual(bytes('keep\nnew'));
  });

  it('preserves an unselected context line without its final newline', () => {
    const repo = repository('old\nend', 'new\nend');
    const parsed = parseDiffWithHunks(repo.diff());
    repo.apply(buildPatchesForSelection(parsed, selected(parsed, 'add')), ['--cached']);
    expect(repo.index()).toEqual(bytes('old\nnew\nend'));
    expect(repo.contents()).toEqual(bytes('new\nend'));
  });

  it('recognizes header-like payload lines in both parsers and applies their patches', () => {
    const repo = repository('-- old\n', '++ new\n');
    const raw = repo.diff();
    expect(parseUnifiedDiff(raw).filter(line => line.kind === 'add' || line.kind === 'del').map(line => line.text)).toEqual(['-- old', '++ new']);
    const parsed = parseDiffWithHunks(raw);
    repo.apply([buildHunkPatch(parsed, 0)], ['--cached']);
    expect(repo.index()).toEqual(bytes('++ new\n'));
    repo.apply(buildPatchesForDiscard(parsed, selected(parsed)));
    expect(repo.contents()).toEqual(bytes('-- old\n'));
  });

  it.skipIf(process.platform === 'win32')('preserves quoted literal filenames through creation, deletion, and modification', () => {
    const file = 'space\tquote"\\percent%20\n.txt';
    for (const [original, working] of [[null, 'new\n'], ['old\n', null], ['old\n', 'new\n']] as const) {
      const repo = repository(original, working, file);
      const parsed = parseDiffWithHunks(repo.diff());
      repo.apply([buildHunkPatch(parsed, 0)], ['--cached']);
      expect(repo.index()).toEqual(bytes(working));
      repo.apply(buildPatchesForDiscard(parsed, selected(parsed)));
      expect(repo.contents()).toEqual(bytes(original));
    }
  });

  it.skipIf(process.platform === 'win32')('stages line content without applying a separate permission change', () => {
    const repo = repository('old\n', 'new\n');
    chmodSync(join(repo.path, repo.file), 0o755);
    const parsed = parseDiffWithHunks(repo.diff());
    const patch = buildHunkPatch(parsed, 0);
    expect(patch).not.toMatch(/^(?:old|new) mode /m);
    repo.apply([patch], ['--cached']);
    expect(repo.git('ls-files', '--stage', '--', repo.file).startsWith('100644 ')).toBe(true);
    repo.apply(buildPatchesForDiscard(parsed, selected(parsed)));
    expect(repo.contents()).toEqual(bytes('old\n'));
    expect(statSync(join(repo.path, repo.file)).mode & 0o111).toBe(0o111);
  });

  it.skipIf(process.platform === 'win32')('preserves executable mode when creating or restoring a file', () => {
    const repo = repository(null, 'first\nsecond\n');
    chmodSync(join(repo.path, repo.file), 0o755);
    const created = parseDiffWithHunks(repo.diff());
    repo.apply(buildPatchesForSelection(created, selected(created, 'add', 'first')), ['--cached']);
    expect(repo.index()).toEqual(bytes('first\n'));
    expect(repo.git('ls-files', '--stage', '--', repo.file).startsWith('100755 ')).toBe(true);

    repo.git('add', '--', repo.file);
    rmSync(join(repo.path, repo.file));
    const deleted = parseDiffWithHunks(repo.diff());
    repo.apply(buildPatchesForDiscard(deleted, selected(deleted)));
    expect(repo.contents()).toEqual(bytes('first\nsecond\n'));
    expect(statSync(join(repo.path, repo.file)).mode & 0o111).toBe(0o111);
  });
});
