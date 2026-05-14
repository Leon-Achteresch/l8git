import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import de from "@/locales/de.json";
import en from "@/locales/en.json";

function readInitialLng(): "de" | "en" {
  if (typeof localStorage === "undefined") return "de";
  try {
    const raw = localStorage.getItem("l8git-locale");
    if (!raw) return "de";
    const p = JSON.parse(raw) as { state?: { locale?: string } };
    return p.state?.locale === "en" ? "en" : "de";
  } catch {
    return "de";
  }
}

const lng = readInitialLng();
if (typeof document !== "undefined") {
  document.documentElement.lang = lng;
}

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng,
  fallbackLng: "de",
  interpolation: { escapeValue: false },
});

export default i18n;
