import { comparisonEffectiveBase, type CommitComparison } from './commit-compare';

/** JSON quoting preserves unusual filenames and refs without interpreting Markdown. */
function cell(value: string): string {
  return JSON.stringify(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;').replace(/`/g, '&#96;');
}

export function comparisonReviewReport(comparison: CommitComparison, reviewed: ReadonlySet<string>, generatedAt = new Date()): string {
  const count = comparison.files.filter(file => reviewed.has(file.path)).length;
  const rows = comparison.files.map(file => `| ${reviewed.has(file.path) ? '[x]' : '[ ]'} | ${file.status} | ${cell(file.path)} | ${file.previous_path ? cell(file.previous_path) : '—'} | ${file.binary ? 'binary' : `+${file.additions} / -${file.deletions}`} |`);
  return [
    '# Git comparison review', '',
    `Generated: ${generatedAt.toISOString()}`, '',
    `Base reference: ${cell(comparison.base)}`, `Base commit: ${comparison.base_hash}`, '',
    `Head reference: ${cell(comparison.head)}`, `Head commit: ${comparison.head_hash}`, '',
    `Mode: ${comparison.mode}`, `Diff base commit: ${comparisonEffectiveBase(comparison)}`, '',
    `Changes: ${comparison.total_files} files, +${comparison.additions} / -${comparison.deletions}.`,
    `History: ${comparison.ahead} ahead, ${comparison.behind} behind.`,
    `Review: ${count}/${comparison.files.length} displayed files marked reviewed.`, '',
    'The marks record this review checklist. They do not prove that tests passed or that changes are correct.',
    'This report describes committed snapshots and excludes uncommitted changes.', '',
    ...(comparison.truncated ? [`Only ${comparison.files.length} of ${comparison.total_files} files are listed; totals cover the full comparison.`, ''] : []),
    '| Reviewed | Status | File (JSON quoted) | Previous file (JSON quoted) | Changes |',
    '| --- | --- | --- | --- | --- |', ...rows, '',
  ].join('\n');
}

export function comparisonReportFilename(comparison: Pick<CommitComparison, 'base_hash' | 'head_hash'>): string {
  const safe = (hash: string) => hash.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'commit';
  return `git-review-${safe(comparison.base_hash)}-${safe(comparison.head_hash)}.md`;
}
