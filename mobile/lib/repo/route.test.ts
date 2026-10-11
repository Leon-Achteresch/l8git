import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({ useGlobalSearchParams: vi.fn(), useLocalSearchParams: vi.fn() }));

import { decodeRepoParam, decodeRouteValue, repoLink, repoSectionHref } from './route';

const paths = [
  '/repos/literal%20name', '/repos/literal name',
  '/repos/literal%2Fname', '/repos/literal/name',
  '/repos/back\\slash', '/repos/trailing ', '/repos/trailing\n',
];

describe('Expo repository route values', () => {
  it('keeps distinct already-decoded Git path names distinct', () => {
    expect(paths.map(decodeRouteValue)).toEqual(paths);
    expect(new Set(paths.map(decodeRouteValue)).size).toBe(paths.length);
    expect(decodeRepoParam('/repos/literal%20name')).toBe('/repos/literal%20name');
    expect(decodeRouteValue('/repos/100%')).toBe('/repos/100%');
  });

  it('uses the first array parameter without decoding or normalizing it', () => {
    expect(decodeRouteValue(['/repos/literal%2Fname', '/repos/other'])).toBe('/repos/literal%2Fname');
    expect(decodeRouteValue(['/repos/back\\slash\n', '/repos/other'])).toBe('/repos/back\\slash\n');
    expect(decodeRouteValue(['', '/repos/other'])).toBe('');
    expect(decodeRouteValue([])).toBe('');
    expect(decodeRouteValue(undefined)).toBe('');
  });

  it.each(paths)('round-trips repository navigation for %j through one URI decoding pass', path => {
    for (const href of [repoLink('host-a', path), repoSectionHref('history', 'host-a', path)]) {
      const params = (href as { params: Record<string, string> }).params;
      expect(params).toEqual({ hostId: 'host-a', repo: path });
      // Expo supplies these once-decoded values to its search-param hooks.
      const decoded = new URLSearchParams(new URLSearchParams(params).toString());
      expect(decodeRouteValue(decoded.get('repo')!)).toBe(path);
      expect(decodeRouteValue(decoded.get('hostId')!)).toBe('host-a');
    }
  });
});
