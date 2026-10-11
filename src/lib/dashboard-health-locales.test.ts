import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';
import pt from '@/locales/pt.json';
import ja from '@/locales/ja.json';
import zh from '@/locales/zh.json';

function leaves(value: unknown, path = ''): Record<string, string> {
  return typeof value === 'string' ? { [path]: value } : Object.fromEntries(Object.entries(value as object).flatMap(([key, child]) => Object.entries(leaves(child, `${path}.${key}`))));
}

describe('localized actionable repository health', () => {
  const source = leaves(en.dashboard.health);
  for (const [language, bundle] of Object.entries({ en, de, es, fr, pt, ja, zh })) {
    it(`${language} covers the states, links and counts without missing interpolation`, async () => {
      const copy = leaves(bundle.dashboard.health);
      expect(Object.keys(copy).sort()).toEqual(Object.keys(source).sort());
      for (const [key, value] of Object.entries(copy)) {
        expect(value.trim(), key).not.toBe('');
        expect((value.match(/\{\{[^}]+\}\}/g) ?? []).sort(), key).toEqual((source[key].match(/\{\{[^}]+\}\}/g) ?? []).sort());
      }
      const i18n = createInstance();
      await i18n.init({ lng: language, resources: { [language]: { translation: bundle } }, interpolation: { escapeValue: false } });
      for (const key of ['workingCopy.count', 'conflicts.count', 'conflicts.partial', 'upstream.ahead', 'upstream.behind', 'upstream.diverged', 'stashes.count', 'worktrees.count']) {
        const message = i18n.t(`dashboard.health.${key}`, { count: 2, ahead: 3, behind: 4 });
        expect(message).not.toContain('dashboard.health.');
        expect(message).not.toContain('{{');
      }
      expect(i18n.t('dashboard.health.upstream.noUpstream')).not.toBe(i18n.t('dashboard.health.upstream.warn'));
      if (language === 'en') {
        expect(i18n.t('dashboard.health.upstream.ahead', { count: 1 })).toBe('1 unpushed commit');
        expect(i18n.t('dashboard.health.upstream.ahead', { count: 2 })).toBe('2 unpushed commits');
      }
    });
  }
});
