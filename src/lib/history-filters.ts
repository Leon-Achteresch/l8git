import type { HistoryFilter } from './ipc/git';

export const EMPTY_HISTORY_FILTER: HistoryFilter = {
  refs: [], author: '', since: '', until: '', query: '', file: '',
};
export const MAX_HISTORY_PRESETS = 20;

export type HistoryFilterPreset = {
  id: string;
  name: string;
  filter: HistoryFilter;
  updatedAt: number;
};

export type HistoryDateError = 'invalidDate' | 'reversedDates';

/** Validate persisted input without accepting properties that aren't Git filters. */
export function sanitizeHistoryFilter(value: unknown): HistoryFilter {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const text = (key: string) => typeof raw[key] === 'string' ? raw[key] as string : '';
  return {
    refs: Array.isArray(raw.refs)
      ? [...new Set(raw.refs.filter((ref): ref is string => typeof ref === 'string').map(ref => ref.trim()).filter(ref => !!ref && !ref.startsWith('-')))]
      : [],
    author: text('author').trim(),
    query: text('query').trim(),
    // Spaces can be part of a real repository path; preserve them.
    file: text('file'),
    since: text('since').trim(),
    until: text('until').trim(),
  };
}

export function historyFilterKey(filter: HistoryFilter): string {
  const value = sanitizeHistoryFilter(filter);
  return JSON.stringify([value.refs.slice().sort(), value.author, value.query, value.file, value.since, value.until]);
}

export function hasHistoryFilters(filter: HistoryFilter): boolean {
  return filter.refs.length > 0 || [filter.author, filter.query, filter.file, filter.since, filter.until].some(Boolean);
}

export function historyFilterCount(filter: HistoryFilter): number {
  return (filter.refs.length > 0 ? 1 : 0) + [filter.author, filter.query, filter.file, filter.since, filter.until].filter(Boolean).length;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  // setFullYear avoids Date's special handling of years 0–99.
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function validateHistoryDates(filter: Pick<HistoryFilter, 'since' | 'until'>): HistoryDateError | null {
  if ((filter.since && !isCalendarDate(filter.since)) || (filter.until && !isCalendarDate(filter.until))) return 'invalidDate';
  if (filter.since && filter.until && filter.since > filter.until) return 'reversedDates';
  return null;
}

export function historyDateRange(days: number, now = new Date()): Pick<HistoryFilter, 'since' | 'until'> {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(0, Math.floor(days) - 1));
  const format = (date: Date) => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { since: format(start), until: format(end) };
}

export function sanitizeHistoryPresets(value: unknown): HistoryFilterPreset[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const names = new Set<string>();
  const presets: HistoryFilterPreset[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string') continue;
    const name = raw.name.trim().slice(0, 80);
    const nameKey = name.toLocaleLowerCase();
    const filter = sanitizeHistoryFilter(raw.filter);
    if (!name || ids.has(raw.id) || names.has(nameKey) || !hasHistoryFilters(filter) || validateHistoryDates(filter)) continue;
    ids.add(raw.id);
    names.add(nameKey);
    presets.push({ id: raw.id, name, filter, updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0 });
    if (presets.length === MAX_HISTORY_PRESETS) break;
  }
  return presets;
}

/** Reusing a preset's name updates it instead of accumulating ambiguous duplicates. */
export function upsertHistoryPreset(presets: HistoryFilterPreset[], name: string, filter: HistoryFilter, id: string, now = Date.now()): HistoryFilterPreset[] {
  const cleanName = name.trim().slice(0, 80);
  const cleanFilter = sanitizeHistoryFilter(filter);
  if (!cleanName || !hasHistoryFilters(cleanFilter) || validateHistoryDates(cleanFilter)) return presets;
  const existing = presets.find(preset => preset.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase());
  return [{ id: existing?.id ?? id, name: cleanName, filter: cleanFilter, updatedAt: now }, ...presets.filter(preset => preset.id !== existing?.id && preset.id !== id)].slice(0, MAX_HISTORY_PRESETS);
}
