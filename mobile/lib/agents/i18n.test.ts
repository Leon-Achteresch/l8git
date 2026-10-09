import { describe, expect, it } from 'vitest';

import { APP_LOCALES } from '@desktop/lib/locales';
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
});
