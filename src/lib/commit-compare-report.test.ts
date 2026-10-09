import { describe, expect, it } from 'vitest';
import { comparisonReportFilename, comparisonReviewReport } from './commit-compare-report';
import type { CommitComparison } from './commit-compare';

const comparison: CommitComparison = {
  base: 'main', head: 'feature', mode: 'direct', base_hash: 'a'.repeat(40), head_hash: 'b'.repeat(40), merge_base: 'c'.repeat(40),
  ahead: 2, behind: 1, additions: 3, deletions: 1, total_files: 2, truncated: false,
  files: [
    { path: 'src/a.ts', previous_path: 'src/old.ts', status: 'R', additions: 3, deletions: 1, binary: false },
    { path: 'image.png', previous_path: null, status: 'M', additions: 0, deletions: 0, binary: true },
  ],
};

describe('comparison review export', () => {
  it('includes full immutable snapshots and all files irrespective of the visible filter', () => {
    const report = comparisonReviewReport(comparison, new Set(['src/a.ts', 'stale.ts']), new Date('2026-10-08T12:00:00Z'));
    expect(report).toContain(`Diff base commit: ${comparison.base_hash}`);
    expect(report).toContain('Review: 1/2 displayed files marked reviewed.');
    expect(report).toContain('| [x] | R | "src/a.ts" | "src/old.ts" | +3 / -1 |');
    expect(report).toContain('| [ ] | M | "image.png" | — | binary |');
    expect(report).toContain('2026-10-08T12:00:00.000Z');
  });

  it('describes merge-base and truncated reports without implying complete review', () => {
    const report = comparisonReviewReport({ ...comparison, mode: 'merge-base', total_files: 8000, truncated: true }, new Set());
    expect(report).toContain(`Diff base commit: ${comparison.merge_base}`);
    expect(report).toContain('Only 2 of 8000 files are listed; totals cover the full comparison.');
    expect(report).toContain('They do not prove that tests passed');
  });

  it('preserves control characters and protects Markdown tables and HTML in filenames', () => {
    const path = 'weird|`<script>\n\t\\.txt';
    const report = comparisonReviewReport({ ...comparison, files: [{ ...comparison.files[0], path }] }, new Set([path]));
    expect(report).toContain('weird&#124;&#96;&lt;script&gt;\\n\\t\\\\.txt');
    expect(report).not.toContain('<script>');
    expect(report.split('\n').filter(line => line.startsWith('| [x]'))).toHaveLength(1);
    expect(comparisonReportFilename({ base_hash: '../unsafe', head_hash: 'b'.repeat(40) })).toBe('git-review-unsafe-bbbbbbbbbbbb.md');
  });
});
