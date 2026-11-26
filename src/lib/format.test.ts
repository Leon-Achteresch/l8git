import { afterAll, describe, expect, it, vi } from 'vitest';
import { formatDate, formatRelative } from './format';
import { formatRelative as blameAge, initials as blameInitials } from '@/components/repo/blame/git-blame-utils';
import { formatRelativeTime } from './dashboard-aggregations';
import i18n, { changeAppLanguage } from './i18n';
import { APP_LOCALES, DEFAULT_LOCALE, isAppLocale } from './locales';

const initialLanguage = i18n.language;
afterAll(async () => { await changeAppLanguage(isAppLocale(initialLanguage) ? initialLanguage : DEFAULT_LOCALE); });

describe('dates in the desktop interface', () => {
  const iso = '2024-03-21T13:30:00Z';
  const date = new Date(iso);

  it.each(APP_LOCALES)('formats future and past blame timestamps in $code', ({ code }) => {
    const relative = new Intl.RelativeTimeFormat(code, { numeric: 'auto', style: 'narrow' });
    expect(blameAge(8200, code, 1000)).toBe(relative.format(2, 'hour'));
    expect(blameAge(1000, code, 8200)).toBe(relative.format(-2, 'hour'));
    expect(blameAge(1000, code, 1000)).toBe(relative.format(0, 'second'));
  });

  it('preserves complete characters in blame author initials', () => {
    expect(blameInitials('🦀 Reporter')).toBe('🦀R');
    expect(blameInitials('Ada Lovelace')).toBe('AL');
    expect(blameInitials(' ')).toBe('?');
  });

  it.each(APP_LOCALES)('uses $code for absolute dates and older commits after a language switch', async ({ code }) => {
    await changeAppLanguage(code);
    expect(formatDate(iso)).toBe(new Intl.DateTimeFormat(code, { dateStyle: 'short', timeStyle: 'medium' }).format(date));
    for (const year of [2024, 2026]) {
      const now = new Date(year, 5, 1);
      const expected = new Intl.DateTimeFormat(code, { day: 'numeric', month: 'short', year: year === 2024 ? undefined : 'numeric' });
      expect(formatRelative(iso, now)).toBe(expected.format(date));
    }
  });

  it('keeps invalid timestamps from breaking a dashboard row', () => {
    expect(formatRelativeTime(new Date(NaN), 'en')).toBe('');
    expect(formatRelativeTime('invalid', 'en')).toBe('');
    expect(formatDate('invalid')).toBe('invalid');
  });

  it('handles epoch seconds, milliseconds and the epoch itself', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(86_400_000);
    try {
      expect(formatRelativeTime(0, 'en')).toBe('yesterday');
      now.mockReturnValue(1_700_000_060_000);
      expect(formatRelativeTime(1_700_000_000, 'en')).toBe('1 minute ago');
      expect(formatRelativeTime(1_700_000_000_000, 'en')).toBe('1 minute ago');
    } finally {
      now.mockRestore();
    }
  });
});
