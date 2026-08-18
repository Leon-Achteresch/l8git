import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  isAppLocale,
  type AppLocale,
} from "@/lib/locales";
import { kvGet } from "@/lib/platform/kv";

type TranslationBundle = Record<string, unknown>;

const loaders: Record<AppLocale, () => Promise<{ default: TranslationBundle }>> = {
  de: () => import("@/locales/de.json"),
  en: () => import("@/locales/en.json"),
  es: () => import("@/locales/es.json"),
  fr: () => import("@/locales/fr.json"),
  pt: () => import("@/locales/pt.json"),
  zh: () => import("@/locales/zh.json"),
  ja: () => import("@/locales/ja.json"),
};

const loaded = new Set<AppLocale>();

function readInitialLng(): AppLocale {
  try {
    const raw = kvGet("l8git-locale");
    if (!raw) return DEFAULT_LOCALE;
    const parsed = JSON.parse(raw) as { state?: { locale?: unknown } };
    const locale = parsed.state?.locale;
    return isAppLocale(locale) ? locale : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function applyDocumentLang(locale: AppLocale) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}

export async function loadLocaleResources(locale: AppLocale): Promise<void> {
  if (loaded.has(locale)) return;
  const mod = await loaders[locale]();
  i18n.addResourceBundle(locale, "translation", mod.default, true, true);
  loaded.add(locale);
}

export async function changeAppLanguage(locale: AppLocale): Promise<void> {
  await loadLocaleResources(locale);
  await i18n.changeLanguage(locale);
  applyDocumentLang(locale);
}

const initialLng = readInitialLng();
applyDocumentLang(initialLng);

const preload = Array.from(new Set<AppLocale>([initialLng, FALLBACK_LOCALE]));
const bundles = await Promise.all(
  preload.map(async (code) => [code, (await loaders[code]()).default] as const),
);
for (const code of preload) loaded.add(code);

await i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    bundles.map(([code, translation]) => [code, { translation }]),
  ),
  lng: initialLng,
  fallbackLng: FALLBACK_LOCALE,
  interpolation: { escapeValue: false },
});

export default i18n;
