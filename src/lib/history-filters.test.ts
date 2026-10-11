import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY_FILTER,
  MAX_HISTORY_PRESETS,
  hasHistoryFilters,
  historyDateRange,
  historyFilterCount,
  historyFilterKey,
  sanitizeHistoryFilter,
  sanitizeHistoryPresets,
  upsertHistoryPreset,
  validateHistoryDates,
} from './history-filters';
import { sanitizeHistoryPreferences } from './history-prefs';

const filter = { ...EMPTY_HISTORY_FILTER, query: 'fix' };

describe('history filter validation', () => {
  it('drops malformed persisted values and user-controlled revision flags', () => {
    expect(sanitizeHistoryFilter({ refs: ['main', ' main ', 123, '-all', ' -all ', ''], author: ' Ada ', query: ' fix ', file: ' leading space.ts ', until: false, dangerous: 'ignored' })).toEqual({
      ...EMPTY_HISTORY_FILTER, refs: ['main'], author: 'Ada', query: 'fix', file: ' leading space.ts ',
    });
    expect(sanitizeHistoryFilter(null)).toEqual(EMPTY_HISTORY_FILTER);
    expect(sanitizeHistoryFilter('filter')).toEqual(EMPTY_HISTORY_FILTER);
  });

  it('treats reference order as equivalent without mutating the selected references', () => {
    const refs = ['release', 'main'];
    expect(historyFilterKey({ ...filter, refs })).toBe(historyFilterKey({ ...filter, refs: ['main', 'release'] }));
    expect(refs).toEqual(['release', 'main']);
    expect(historyFilterKey(filter)).not.toBe(historyFilterKey({ ...filter, file: 'src/' }));
  });

  it('counts a branch selection as one category and detects empty filters', () => {
    expect(hasHistoryFilters(EMPTY_HISTORY_FILTER)).toBe(false);
    expect(hasHistoryFilters({ ...EMPTY_HISTORY_FILTER, refs: ['main'] })).toBe(true);
    expect(historyFilterCount({ ...filter, refs: ['main', 'release'], author: 'Ada', since: '2026-01-01' })).toBe(4);
  });

  it('accepts same-day and open-ended ranges', () => {
    expect(validateHistoryDates({ since: '2026-10-08', until: '2026-10-08' })).toBeNull();
    expect(validateHistoryDates({ since: '2026-10-08', until: '' })).toBeNull();
    expect(validateHistoryDates({ since: '', until: '2026-10-08' })).toBeNull();
    expect(validateHistoryDates({ since: '', until: '' })).toBeNull();
  });

  it('checks the actual calendar, leap years and date order', () => {
    expect(validateHistoryDates({ since: '2024-02-29', until: '2024-03-01' })).toBeNull();
    expect(validateHistoryDates({ since: '2025-02-29', until: '' })).toBe('invalidDate');
    expect(validateHistoryDates({ since: '', until: '2026-04-31' })).toBe('invalidDate');
    expect(validateHistoryDates({ since: '0000-01-01', until: '' })).toBe('invalidDate');
    expect(validateHistoryDates({ since: '0001-01-01', until: '0099-12-31' })).toBeNull();
    expect(validateHistoryDates({ since: '2026-10-09', until: '2026-10-08' })).toBe('reversedDates');
    expect(validateHistoryDates({ since: 'tomorrow', until: '' })).toBe('invalidDate');
  });

  it('produces inclusive local calendar ranges across month and year boundaries', () => {
    expect(historyDateRange(7, new Date(2026, 0, 3, 23, 45))).toEqual({ since: '2025-12-28', until: '2026-01-03' });
    expect(historyDateRange(1, new Date(2026, 9, 8))).toEqual({ since: '2026-10-08', until: '2026-10-08' });
    expect(historyDateRange(30, new Date(2024, 2, 1))).toEqual({ since: '2024-02-01', until: '2024-03-01' });
  });
});

describe('named saved history searches', () => {
  it('saves immutable filter copies including the branch selection', () => {
    const original = { ...filter, refs: ['main'] };
    const saved = upsertHistoryPreset([], ' Release fixes ', original, 'new-id', 100);
    original.refs.push('later');
    expect(saved).toEqual([{ id: 'new-id', name: 'Release fixes', filter: { ...filter, refs: ['main'] }, updatedAt: 100 }]);
  });

  it('updates a name case-insensitively and preserves the existing preset id', () => {
    const initial = upsertHistoryPreset([], 'Release', filter, 'first', 100);
    const updated = upsertHistoryPreset(initial, 'release', { ...filter, author: 'Ada' }, 'unused', 200);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ id: 'first', name: 'release', updatedAt: 200, filter: { author: 'Ada' } });
  });

  it('rejects unnamed, empty and invalid-date searches without changing saved searches', () => {
    const initial = upsertHistoryPreset([], 'Release', filter, 'first');
    expect(upsertHistoryPreset(initial, '  ', filter, 'new')).toBe(initial);
    expect(upsertHistoryPreset(initial, 'Empty', EMPTY_HISTORY_FILTER, 'new')).toBe(initial);
    expect(upsertHistoryPreset(initial, 'Backwards', { ...filter, since: '2026-10-08', until: '2026-01-01' }, 'new')).toBe(initial);
  });

  it('keeps at most 20 named searches with the latest saved search first', () => {
    let presets = [] as ReturnType<typeof upsertHistoryPreset>;
    for (let index = 0; index < 25; index++) presets = upsertHistoryPreset(presets, `Search ${index}`, filter, `id-${index}`, index);
    expect(presets).toHaveLength(MAX_HISTORY_PRESETS);
    expect(presets[0].id).toBe('id-24');
    expect(presets[presets.length - 1]?.id).toBe('id-5');
  });

  it('recovers valid searches from malformed storage and removes duplicate ids and names', () => {
    const valid = { id: 'valid', name: 'Fixes', filter, updatedAt: 1 };
    expect(sanitizeHistoryPresets([null, {}, valid, { ...valid, id: 'other', name: 'fixes' }, { ...valid, name: 'Other' }, { id: 'bad', name: 'Invalid', filter: { ...filter, since: '2026-02-30' } }])).toEqual([valid]);
    expect(sanitizeHistoryPresets({ presets: [valid] })).toEqual([]);
  });

  it('limits untrusted preset collections and strips non-Git properties', () => {
    const presets = Array.from({ length: 40 }, (_, index) => ({ id: `id-${index}`, name: `Search ${index}`, filter: { ...filter, injected: true }, updatedAt: Infinity }));
    const sanitized = sanitizeHistoryPresets(presets);
    expect(sanitized).toHaveLength(MAX_HISTORY_PRESETS);
    expect(sanitized[0].updatedAt).toBe(0);
    expect(sanitized[0].filter).toEqual(filter);
  });
});

describe('repository history preference recovery', () => {
  it('keeps independent searches for each repository', () => {
    const saved = { id: 'one', name: 'Fixes', filter, updatedAt: 1 };
    const result = sanitizeHistoryPreferences({ '/repo/a': { filter, presets: [saved] }, '/repo/b': { filter: { ...filter, author: 'Ada' }, presets: [] } });
    expect(result['/repo/a'].presets).toEqual([saved]);
    expect(result['/repo/b'].filter.author).toBe('Ada');
    expect(result['/repo/b'].presets).toEqual([]);
  });

  it('clears invalid persisted date ranges while retaining useful author and message filters', () => {
    const result = sanitizeHistoryPreferences({ '/repo': { filter: { ...filter, author: 'Ada', since: '2026-10-08', until: '2026-01-01' }, presets: false }, invalid: null });
    expect(result).toEqual({ '/repo': { filter: { ...filter, author: 'Ada' }, presets: [] } });
    expect(sanitizeHistoryPreferences(null)).toEqual({});
    expect(sanitizeHistoryPreferences([])).toEqual({});
  });
});
