export function repoDefaultTabTitle(repoPath: string, branch?: string): string {
  const name = repoPath.split(/[/\\]/).filter(Boolean).pop();
  if (branch?.trim()) return branch.trim();
  return name ?? "Terminal";
}

export function cwdTabTitle(cwd: string): string | null {
  const cleaned = cwd.replace(/[/\\]+$/, "");
  const parts = cleaned.split(/[/\\]/).filter(Boolean);
  if (parts.length === 0) return cwd ? "/" : null;
  return parts[parts.length - 1];
}
