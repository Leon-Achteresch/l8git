import { expect, it } from 'vitest';
import { worktreePathParts } from './worktree-display';

it.each([
  ['/home/user/repo', 'repo', '/home/user/'],
  ['/home/user/one\\two', 'one\\two', '/home/user/'],
  ['C:\\Projects\\repo\\', 'repo', 'C:\\Projects\\'],
  ['C:/Projects/repo', 'repo', 'C:/Projects/'],
  ['\\\\server\\share\\repo', 'repo', '\\\\server\\share\\'],
  ['/', '/', ''],
  ['C:\\', 'C:\\', ''],
])('preserves the native path in %s', (path, name, parent) => {
  expect(worktreePathParts(path)).toEqual({ name, parent });
});
