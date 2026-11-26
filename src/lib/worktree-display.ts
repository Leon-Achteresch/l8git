/** Preserve native path separators, including literal backslashes in POSIX names. */
export function worktreePathParts(path: string) {
  const windows = /^(?:[a-z]:[\\/]|\\\\)/i.test(path);
  const trimmed = path.replace(windows ? /[\\/]+$/ : /\/+$/, '');
  if (!trimmed || (windows && /^[a-z]:$/i.test(trimmed))) return { name: path, parent: '' };
  const separator = Math.max(trimmed.lastIndexOf('/'), windows ? trimmed.lastIndexOf('\\') : -1);
  return { name: trimmed.slice(separator + 1), parent: trimmed.slice(0, separator + 1) };
}
