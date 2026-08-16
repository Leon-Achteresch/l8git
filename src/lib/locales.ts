export const APP_LOCALES = [
  { code: "de", nativeName: "Deutsch" },
  { code: "en", nativeName: "English" },
  { code: "es", nativeName: "Español" },
  { code: "fr", nativeName: "Français" },
  { code: "pt", nativeName: "Português" },
  { code: "zh", nativeName: "中文" },
  { code: "ja", nativeName: "日本語" },
] as const;

export type AppLocale = (typeof APP_LOCALES)[number]["code"];

export const DEFAULT_LOCALE: AppLocale = "de";
export const FALLBACK_LOCALE: AppLocale = "en";

const KNOWN_CODES: ReadonlySet<string> = new Set(APP_LOCALES.map((l) => l.code));

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && KNOWN_CODES.has(value);
}

export function localeNativeName(code: AppLocale): string {
  return APP_LOCALES.find((l) => l.code === code)?.nativeName ?? code;
}
