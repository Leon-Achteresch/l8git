import { palette } from '~/lib/theme';

const ACCENTS: readonly string[] = palette.chart;

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function accentFor(value: string | null | undefined): string {
  if (!value) {
    return palette.mutedForeground;
  }
  return ACCENTS[hashString(value) % ACCENTS.length];
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '')
    .trim()
    .split(/[\s._@-]+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function shortHash(hash: string | null | undefined, length = 7): string {
  return (hash ?? '').slice(0, length);
}

export function splitPath(path: string): { dir: string; name: string } {
  const normalized = path.replace(/\\/g, '/');
  const cut = normalized.lastIndexOf('/');
  if (cut < 0) {
    return { dir: '', name: normalized };
  }
  return { dir: normalized.slice(0, cut), name: normalized.slice(cut + 1) };
}

export function repoName(path: string | null | undefined): string {
  if (!path) {
    return '';
  }
  const trimmed = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return splitPath(trimmed).name || trimmed;
}

export function middleTruncate(value: string, max: number): string {
  if (value.length <= max || max < 5) {
    return value;
  }
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

const UNITS: readonly [number, string][] = [
  [60, 'm'],
  [60, 'h'],
  [24, 'd'],
];

export function relativeTime(
  value: string | number | Date | null | undefined,
  now: number = Date.now()
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) {
    return typeof value === 'string' ? value : '';
  }
  const seconds = Math.round((now - time) / 1000);
  if (seconds < 0) {
    return 'soon';
  }
  if (seconds < 45) {
    return 'just now';
  }
  let amount = seconds;
  let unit = 's';
  for (const [factor, next] of UNITS) {
    if (amount < factor) {
      break;
    }
    amount = Math.round(amount / factor);
    unit = next;
  }
  if (unit === 'd' && amount >= 7) {
    const weeks = Math.round(amount / 7);
    if (weeks < 5) {
      return `${weeks}w ago`;
    }
    const months = Math.round(amount / 30);
    if (months < 12) {
      return `${Math.max(1, months)}mo ago`;
    }
    return `${Math.round(amount / 365)}y ago`;
  }
  return `${amount}${unit} ago`;
}

export function formatDelta(value: number | null | undefined, sign: '+' | '-'): string | null {
  if (!value) {
    return null;
  }
  return `${sign}${value}`;
}

export function expandTabs(value: string, width = 4): string {
  if (!value.includes('\t')) {
    return value;
  }
  let out = '';
  for (const char of value) {
    if (char === '\t') {
      out += ' '.repeat(width - (out.length % width));
    } else {
      out += char;
    }
  }
  return out;
}
