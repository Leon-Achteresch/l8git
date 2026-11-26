export type GitCommandEntry = {
  seq: number;
  repoPath: string;
  args: string[];
  exitOk: boolean;
  durationMs: number;
  startedAt: string;
};

export const GIT_COMMAND_LOG_CAP = 500;

/** Format one literal argument for sh, Bash or Zsh, including interactive shells. */
export function quoteArg(arg: string): string {
  if (/^[a-zA-Z0-9_./@%+:,-][a-zA-Z0-9_./@%+:,=-]*$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export function formatGitCommand(args: readonly string[]): string {
  if (args.length === 0) return 'git';
  return `git ${args.map(quoteArg).join(' ')}`;
}

const searchableEntries = new WeakMap<GitCommandEntry, string[]>();

function commandSearchFields(entry: GitCommandEntry): string[] {
  const cached = searchableEntries.get(entry);
  if (cached) return cached;
  const literal = ['git', ...entry.args].join(' ').toLowerCase();
  const displayed = formatGitCommand(entry.args).toLowerCase();
  const fields = [entry.repoPath.toLowerCase(), literal];
  if (displayed !== literal) fields.push(displayed);
  searchableEntries.set(entry, fields);
  return fields;
}

/** A leading status filter can be combined with a literal command or repository path. */
export function filterCommandLog(entries: GitCommandEntry[], query: string): GitCommandEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;
  const status = /^status:(failed|ok)(?:\s+|$)/.exec(normalized);
  const text = normalized.slice(status?.[0].length ?? 0);
  return entries.filter(entry => {
    if (status && entry.exitOk !== (status[1] === 'ok')) return false;
    return !text || commandSearchFields(entry).some(field => field.includes(text));
  });
}

const durationFormats = new Map<string, Intl.NumberFormat>();

export function formatDurationMs(ms: number, locale = 'en'): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) {
    const digits = ms < 10_000 ? 2 : 1;
    const key = `${locale}|${digits}`;
    let format = durationFormats.get(key);
    if (!format) {
      format = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
      durationFormats.set(key, format);
    }
    return `${format.format(ms / 1000)} s`;
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
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
