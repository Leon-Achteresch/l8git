import { describe, expect, it } from 'vitest';

import { backendErrorCode, findBackendError, formatBackendError, parseBackendError } from './backend-error';
import fixtures from './backend-error.fixtures.json';
import de from '@/locales/de.json';
import en from '@/locales/en.json';

function translator(bundle: Record<string, unknown>) {
  return (key: string, options: Record<string, unknown> = {}) => {
    const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
    if (typeof value !== 'string') return key;
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ''));
  };
}

describe('parseBackendError', () => {
  it.each(fixtures.coded)('parses the shared coded sample $code', ({ wire, code, params, message }) => {
    expect(parseBackendError(wire)).toEqual({ code, params, message });
    expect(parseBackendError(new Error(wire)).code).toBe(code);
  });

  it.each(fixtures.uncoded)('keeps uncoded or malformed input as plain text: %j', (wire) => {
    expect(parseBackendError(wire)).toEqual({ code: null, params: {}, message: wire });
    expect(backendErrorCode(wire)).toBeNull();
  });

  it('finds a code behind a prefix only when asked to search', () => {
    const wire = fixtures.coded[0].wire;
    expect(parseBackendError(`Error: ${wire}`).code).toBeNull();
    expect(findBackendError(`Error: ${wire}`).code).toBe('undo.nothingToUndo');
    expect(findBackendError('Error: plain').code).toBeNull();
  });

  it('reads the raw host error kept next to a display message', () => {
    const error = Object.assign(new Error('There is nothing to undo.'), { backendError: fixtures.coded[0].wire });
    expect(backendErrorCode(error)).toBe('undo.nothingToUndo');
  });

  it('accepts non-string errors without throwing', () => {
    expect(parseBackendError(undefined).code).toBeNull();
    expect(parseBackendError({ toString: () => 'boom' }).message).toBe('boom');
  });
});

describe('formatBackendError', () => {
  const [nothing, reflog, field, files, lookalike] = fixtures.coded.map((sample) => sample.wire);

  it('translates codes with params, labels and lists', () => {
    expect(formatBackendError(nothing, translator(de))).toBe('Es gibt nichts rückgängig zu machen.');
    expect(formatBackendError(reflog, translator(de))).toBe('Unbekannter Reflog-Eintrag: HEAD@{3}');
    expect(formatBackendError(field, translator(de))).toBe('Branch-Name darf nicht leer sein.');
    expect(formatBackendError(field, translator(en))).toBe('Branch name must not be empty.');
    expect(formatBackendError(files, translator(en))).toBe('Tracked files have local changes: a.txt, b "q".txt');
    expect(formatBackendError(lookalike, translator(en))).toBe('The last operation changed after this preview.');
  });

  it('falls back to the embedded English message for unknown codes or labels', () => {
    const unknown = '\u001fSomething new happened.\u001fl8e:{"code":"future.thing"}\u001f';
    expect(formatBackendError(unknown, translator(de))).toBe('Something new happened.');
    const label = '\u001fGizmo must not be empty.\u001fl8e:{"code":"field.required","params":{"field":"gizmo"}}\u001f';
    expect(formatBackendError(label, translator(de))).toBe('Gizmo must not be empty.');
  });

  it('translates coded segments wrapped in a longer message', () => {
    expect(formatBackendError(`Restore failed for x: ${nothing}`, translator(de)))
      .toBe('Restore failed for x: Es gibt nichts rückgängig zu machen.');
    expect(formatBackendError(`${field} / ${reflog}`, translator(en)))
      .toBe('Branch name must not be empty. / Unknown reflog entry: HEAD@{3}');
  });

  it('returns plain messages unchanged and never shows a payload', () => {
    for (const wire of fixtures.uncoded) {
      const shown = formatBackendError(wire, translator(en));
      if (!wire.includes('\u001f')) expect(shown).toBe(wire);
      if (wire.startsWith('\u001f') && wire.endsWith('\u001f')) expect(shown).not.toContain('l8e:{');
    }
    expect(formatBackendError('\u001fBad\u001fl8e:not json\u001f', translator(en))).toBe('Bad');
  });
});
