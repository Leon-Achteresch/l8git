import i18n from '@/lib/i18n';

/**
 * Coded backend errors (see src-tauri/src/error.rs):
 * `\u001f<English message>\u001fl8e:{"code":"…","params":{…}}\u001f`. The message never contains
 * U+001F and JSON escapes it, so a coded segment is unambiguous even inside a longer message.
 * Uncoded errors stay plain text.
 */
const SEP = '\u001f';
const TAG = 'l8e:';
const SEGMENT = /\u001f[^\u001f]*\u001fl8e:[^\u001f]*\u001f/g;
const CODE = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;
/** Params whose value is a label id translated via `backendErrors.labels.<id>`. */
const LABEL_PARAMS = new Set(['field', 'feature']);

export type BackendErrorParams = Record<string, string | string[]>;
export type BackendError = { code: string | null; params: BackendErrorParams; message: string };
type Translate = (key: string, options?: Record<string, unknown>) => string;

function errorString(error: unknown): string {
  if (typeof error === 'string') return error;
  // Mobile's ProtocolError keeps the raw host error next to its display message.
  const raw = (error as { backendError?: unknown } | null)?.backendError;
  if (typeof raw === 'string') return raw;
  if (error instanceof Error) return error.message;
  return String(error);
}

function validParams(value: unknown): value is BackendErrorParams {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((item) =>
    typeof item === 'string' || (Array.isArray(item) && item.every((entry) => typeof entry === 'string')));
}

/** Parses an error that consists of exactly one coded segment; anything else is uncoded. */
export function parseBackendError(error: unknown): BackendError {
  const raw = errorString(error);
  const uncoded = { code: null, params: {}, message: raw };
  const parts = raw.split(SEP);
  if (parts.length !== 4 || parts[0] !== '' || parts[3] !== '' || !parts[2].startsWith(TAG)) return uncoded;
  let payload: unknown;
  try {
    payload = JSON.parse(parts[2].slice(TAG.length));
  } catch {
    return uncoded;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return uncoded;
  const { code, params = {} } = payload as { code?: unknown; params?: unknown };
  if (typeof code !== 'string' || !CODE.test(code) || !validParams(params)) return uncoded;
  return { code, params, message: parts[1] };
}

/** The first coded segment anywhere in the error (e.g. behind an "Error: " prefix), for branching on codes. */
export function findBackendError(error: unknown): BackendError {
  const raw = errorString(error);
  const whole = parseBackendError(raw);
  if (whole.code) return whole;
  for (const segment of raw.match(SEGMENT) ?? []) {
    const parsed = parseBackendError(segment);
    if (parsed.code) return parsed;
  }
  return whole;
}

export function backendErrorCode(error: unknown): string | null {
  return parseBackendError(error).code;
}

function translate({ code, params, message }: BackendError, t: Translate): string {
  if (!code) return message;
  const values: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(params)) {
    if (Array.isArray(value)) values[name] = value.join(', ');
    else if (LABEL_PARAMS.has(name)) {
      const labelKey = `backendErrors.labels.${value}`;
      const label = CODE.test(labelKey) ? t(labelKey) : labelKey;
      if (label === labelKey) return message;
      values[name] = label;
    } else values[name] = value;
  }
  const key = `backendErrors.${code}`;
  const translated = t(key, values);
  return translated === key ? message : translated;
}

/**
 * Display text for any caught error: every coded segment (also one wrapped in a longer message)
 * becomes its translation, or its embedded English message for unknown codes; the rest stays as is.
 */
export function formatBackendError(error: unknown, t: Translate = i18n.t.bind(i18n) as Translate): string {
  return errorString(error).replace(SEGMENT, (segment) => {
    const parsed = parseBackendError(segment);
    return parsed.code ? translate(parsed, t) : segment.split(SEP)[1];
  });
}
