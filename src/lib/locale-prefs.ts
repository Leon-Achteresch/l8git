import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import i18n from "@/lib/i18n";

export type AppLocale = "de" | "en";

type LocalePrefs = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
};

export const useLocalePrefs = create<LocalePrefs>()(
  persist(
    (set) => ({
      locale: "de",
      setLocale: (locale) => {
        void i18n.changeLanguage(locale);
        if (typeof document !== "undefined") {
          document.documentElement.lang = locale;
        }
        set({ locale });
      },
    }),
    {
      name: "l8git-locale",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state?.locale === "de" || state?.locale === "en") {
          void i18n.changeLanguage(state.locale);
          if (typeof document !== "undefined") {
            document.documentElement.lang = state.locale;
          }
        }
      },
    },
  ),
);
