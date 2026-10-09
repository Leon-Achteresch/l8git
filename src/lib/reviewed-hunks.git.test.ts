import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildPatchesForDiscard, buildPatchesForSelection, parseDiffWithHunks } from './unified-diff';

const scratch: string[] = [];
afterEach(() => { for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }); });

for (const newline of ['\n', '\r\n']) {
  it.each(['stage', 'unstage', 'discard'] as const)(`applies two selected hunks in one %s batch while preserving the remaining ${newline === '\n' ? 'LF' : 'CRLF'} edit`, action => {
    const path = mkdtempSync(join(tmpdir(), 'l8git-reviewed-batch-')); scratch.push(path);
    const git = (...args: string[]) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8' });
    git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
    git('config', 'commit.gpgsign', 'false'); git('config', 'core.autocrlf', 'false');
    const original = Array.from({ length: 60 }, (_, index) => `line ${index}`);
    const working = [...original]; for (const index of [8, 28, 48]) working[index] = `changed ${index}`;
    const content = (lines: string[]) => `${lines.join(newline)}${newline}`;
    writeFileSync(join(path, 'selected.txt'), content(original)); writeFileSync(join(path, 'untouched.txt'), 'untouched\n');
    git('add', '.'); git('commit', '-qm', 'base');
    writeFileSync(join(path, 'selected.txt'), content(working));
    if (action === 'unstage') git('add', '--', 'selected.txt');
    const parsed = parseDiffWithHunks(git('diff', '--no-ext-diff', '--no-color', '--no-renames', ...(action === 'unstage' ? ['--cached'] : []), '--', 'selected.txt'));
    const selected = new Set<string>();
    parsed.hunks.forEach((hunk, hunkIndex) => hunk.lines.forEach((line, lineIndex) => {
      if ((line.kind === 'add' || line.kind === 'del') && /(?:line|changed) (?:8|28)\r?$/.test(line.text)) selected.add(`${hunkIndex}:${lineIndex}`);
    }));
    const patches = action === 'discard' ? buildPatchesForDiscard(parsed, selected) : buildPatchesForSelection(parsed, selected, action === 'unstage');
    expect(patches).toHaveLength(2);
    const flags = action === 'discard' ? [] : ['--cached', ...(action === 'unstage' ? ['--reverse'] : [])];
    // Match the native batch: one complete patch stream, checked then applied once.
    const batch = patches.join('');
    execFileSync('git', ['-C', path, 'apply', '--check', '--whitespace=nowarn', ...flags], { input: batch });
    execFileSync('git', ['-C', path, 'apply', '--whitespace=nowarn', ...flags], { input: batch });
    const expected = [...(action === 'stage' ? original : working)];
    for (const index of [8, 28]) expected[index] = action === 'stage' ? working[index] : original[index];
    expect(action === 'discard' ? readFileSync(join(path, 'selected.txt'), 'utf8') : git('show', ':selected.txt')).toBe(content(expected));
    expect(action === 'discard' ? git('show', ':selected.txt') : readFileSync(join(path, 'selected.txt'), 'utf8')).toBe(content(action === 'discard' ? original : working));
    expect(readFileSync(join(path, 'untouched.txt'), 'utf8')).toBe('untouched\n');
    expect(git('show', ':untouched.txt')).toBe('untouched\n');
  });
}
