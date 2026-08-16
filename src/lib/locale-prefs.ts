import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { changeAppLanguage } from "@/lib/i18n";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/locales";

export type { AppLocale };

type LocalePrefs = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
};

export const useLocalePrefs = create<LocalePrefs>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => {
        void changeAppLanguage(locale);
        set({ locale });
      },
    }),
    {
      name: "l8git-locale",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (isAppLocale(state?.locale)) {
          void changeAppLanguage(state.locale);
        }
      },
    },
  ),
);
