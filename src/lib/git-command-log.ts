export type GitCommandEntry = {
  seq: number;
  repoPath: string;
  args: string[];
  exitOk: boolean;
  durationMs: number;
  startedAt: string;
};

export const GIT_COMMAND_LOG_CAP = 500;

const NEEDS_QUOTES = /[\s"'\\$`]/;

export function quoteArg(arg: string): string {
  if (arg.length === 0) return '""';
  if (!NEEDS_QUOTES.test(arg)) return arg;
  return `"${arg.replace(/(["\\$`])/g, '\\$1')}"`;
}

export function formatGitCommand(args: readonly string[]): string {
  if (args.length === 0) return 'git';
  return `git ${args.map(quoteArg).join(' ')}`;
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')} min`;
}

export function mergeCommandEntries(
  existing: readonly GitCommandEntry[],
  incoming: readonly GitCommandEntry[],
  cap: number = GIT_COMMAND_LOG_CAP,
): GitCommandEntry[] {
  const bySeq = new Map<number, GitCommandEntry>();
  for (const entry of existing) bySeq.set(entry.seq, entry);
  for (const entry of incoming) bySeq.set(entry.seq, entry);
  return [...bySeq.values()].sort((a, b) => b.seq - a.seq).slice(0, cap);
}
