import i18n from 'i18next';
import { useSyncExternalStore } from 'react';

import enTranslation from '@desktop/locales/en.json';
import type { AppLocale as RequestedLocale } from '@desktop/lib/locales';

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

// Shared desktop preferences can request any supported desktop language. The
// mobile adapter serves its bundled English fallback for those requests.
export async function loadLocaleResources(_locale: RequestedLocale): Promise<void> {
  return Promise.resolve();
}

export async function changeAppLanguage(locale: RequestedLocale): Promise<void> {
  await loadLocaleResources(locale);
  await i18n.changeLanguage(FALLBACK_LOCALE);
}

// Same row hooks as the desktop i18n module, for shared desktop components.
const subscribeLanguage = (onChange: () => void) => {
  i18n.on('languageChanged', onChange);
  return () => i18n.off('languageChanged', onChange);
};
const getLanguage = () => i18n.language;

export function useLanguage(): string {
  return useSyncExternalStore(subscribeLanguage, getLanguage);
}

export function useRowT() {
  useLanguage();
  return i18n.t;
}

export default i18n;
