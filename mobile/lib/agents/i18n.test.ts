import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { APP_LOCALES } from '@desktop/lib/locales';
import * as mobileI18n from './i18n';
import i18n, { changeAppLanguage, loadLocaleResources } from './i18n';

describe('mobile locale adapter', () => {
  it('accepts shared locale preferences while retaining the bundled English fallback', async () => {
    for (const { code } of APP_LOCALES) {
      await loadLocaleResources(code);
      await changeAppLanguage(code);
      expect(i18n.language).toBe('en');
      expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
    }
  });

  // Mobile resolves @/lib/i18n to this file, so shared desktop components need every desktop export here.
  it('exports everything the desktop i18n module exports', () => {
    const desktop = readFileSync(new URL('../../../src/lib/i18n.ts', import.meta.url), 'utf8');
    const names = [...desktop.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(mobileI18n, name).toHaveProperty(name);
  });
});
