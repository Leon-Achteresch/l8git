import { describe, expect, it, vi } from 'vitest';
import { historySectionTitleResolver } from './commit-history-sections';

vi.mock('@/lib/i18n', () => ({ default: { t: (key: string) => key } }));

describe('history section dates in local time', () => {
  // November 2 is a Monday. Sunday must still be grouped as yesterday.
  const monday = historySectionTitleResolver(new Date(2026, 10, 2, 12));
  it.each([
    [new Date(2026, 10, 2, 0), 'today'],
    [new Date(2026, 10, 2, 23, 59), 'today'],
    [new Date(2026, 10, 1, 0), 'yesterday'],
    [new Date(2026, 9, 31, 23, 59), 'earlier'],
    [new Date(2026, 10, 3, 0), 'earlier'],
  ] as const)('groups %s as %s', (date, section) => {
    expect(monday(date.toISOString())).toBe(`commitHistory.${section}`);
  });
  it('groups Monday into this week on Thursday and handles invalid dates', () => {
    const thursday = historySectionTitleResolver(new Date(2026, 10, 5));
    expect(thursday(new Date(2026, 10, 2).toISOString())).toBe('commitHistory.thisWeek');
    expect(thursday('invalid')).toBe('commitHistory.earlier');
  });
});
