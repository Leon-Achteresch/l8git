/** Compile once per query, including the common "*.ext" suffix search. */
export function filePathFilter(query: string): (path: string | null | undefined) => boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return () => true;
  if (/^\*\.[^*/]+$/.test(needle)) {
    const suffix = needle.slice(1);
    return path => !!path?.toLowerCase().endsWith(suffix);
  }
  return path => !!path?.toLowerCase().includes(needle);
}

export function filterChangedFiles<T extends { path: string; previous_path?: string | null }>(files: T[], query: string): T[] {
  if (!query.trim()) return files;
  const matches = filePathFilter(query);
  return files.filter(file => matches(file.path) || matches(file.previous_path));
}
