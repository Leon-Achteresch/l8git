import { describe, expect, it } from "vitest";

import i18n, { changeAppLanguage, loadLocaleResources } from "@/lib/i18n";
import { APP_LOCALES, isAppLocale } from "@/lib/locales";

describe("i18n", () => {
  it("startet in der Standardsprache und laedt nur sie plus den Fallback", () => {
    expect(i18n.language).toBe("de");
    expect(i18n.t("settings.languageTitle")).toBe("Sprache");
    expect(i18n.hasResourceBundle("de", "translation")).toBe(true);
    expect(i18n.hasResourceBundle("en", "translation")).toBe(true);
    expect(i18n.hasResourceBundle("fr", "translation")).toBe(false);
  });

  it("wechselt zwischen de und en", async () => {
    await changeAppLanguage("en");
    expect(i18n.language).toBe("en");
    expect(i18n.t("settings.languageTitle")).toBe("Language");

    await changeAppLanguage("de");
    expect(i18n.language).toBe("de");
    expect(i18n.t("settings.languageTitle")).toBe("Sprache");
  });

  it("laedt alle registrierten Sprachen nach", async () => {
    for (const { code } of APP_LOCALES) {
      await loadLocaleResources(code);
      expect(i18n.hasResourceBundle(code, "translation")).toBe(true);
      expect(i18n.getResource(code, "translation", "settings.languageTitle")).toBeTruthy();
    }
    await changeAppLanguage("ja");
    expect(i18n.t("common.save")).toBeTruthy();
    await changeAppLanguage("de");
  });

  it("erkennt nur registrierte Sprachcodes", () => {
    expect(isAppLocale("zh")).toBe(true);
    expect(isAppLocale("kl")).toBe(false);
    expect(isAppLocale(undefined)).toBe(false);
  });
});
