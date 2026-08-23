import i18n from 'i18next';

import enTranslation from '@desktop/locales/en.json';

export type AppLocale = 'en';

export const DEFAULT_LOCALE: AppLocale = 'en';
export const FALLBACK_LOCALE: AppLocale = 'en';

if (!i18n.isInitialized) {
  void i18n.init({
    resources: { en: { translation: enTranslation as Record<string, unknown> } },
    lng: DEFAULT_LOCALE,
    fallbackLng: FALLBACK_LOCALE,
    interpolation: { escapeValue: false },
  });
}

export async function loadLocaleResources(_locale: AppLocale): Promise<void> {
  return Promise.resolve();
}

export async function changeAppLanguage(_locale: AppLocale): Promise<void> {
  return Promise.resolve();
}

export default i18n;
