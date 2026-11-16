import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import de from "@/locales/de.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import pt from "@/locales/pt.json";
import ja from "@/locales/ja.json";
import zh from "@/locales/zh.json";
import type { RebaseStatus } from "./repo-store";
import { conflictSideLabels } from "./conflict-side-labels";

const rebaseFixture: RebaseStatus = {
  in_progress: true, kind: "normal", step: 2, total: 2,
  head_name: "feature", onto: "a".repeat(40), onto_short: "aaaaaaa",
  stopped: { hash: "b".repeat(40), short_hash: "bbbbbbb", subject: "Replay this change" },
  current_action: "pick", conflicted_paths: ["shared.txt"], todo: [],
};

describe("conflict side roles", () => {
  it("keeps ordinary merge labels even if an inactive rebase status has old metadata", async () => {
    const i18n = createInstance();
    await i18n.init({ lng: "en", resources: { en: { translation: en } } });
    const normal = conflictSideLabels(i18n.t);
    expect(normal.oursHead).toBe("Ours (HEAD)");
    expect(normal.theirsIncoming).toBe("Theirs (incoming)");
    expect(normal.explanation).toBeNull();
    expect(conflictSideLabels(i18n.t, { ...rebaseFixture, in_progress: false })).toEqual(normal);
  });

  it("handles incomplete rebase metadata without inventing branch or commit identities", async () => {
    const i18n = createInstance();
    await i18n.init({ lng: "en", resources: { en: { translation: en } } });
    const labels = conflictSideLabels(i18n.t, {
      ...rebaseFixture, onto: null, onto_short: null, stopped: null,
    });
    expect(labels.oursHead).toBe("Rebased state (HEAD)");
    expect(labels.theirsIncoming).toBe("Commit being replayed");
    expect(labels.explanation).toContain("previously replayed commits");
    expect(labels.explanation).not.toMatch(/null|undefined|Target base/);
  });

  for (const [code, locale] of Object.entries({ en, de, es, fr, pt, ja, zh })) {
    it(`${code} supplies consistent roles, actions and context with resolved placeholders`, async () => {
      const i18n = createInstance();
      await i18n.init({ lng: code, fallbackLng: false, resources: { [code]: { translation: locale } } });
      const labels = conflictSideLabels(i18n.t, rebaseFixture);
      expect(Object.keys(locale.mergeEditor.rebase).sort()).toEqual(Object.keys(en.mergeEditor.rebase).sort());
      for (const [key, value] of Object.entries(locale.mergeEditor.rebase)) {
        expect(value.match(/{{[^}]+}}/g) ?? []).toEqual(en.mergeEditor.rebase[key as keyof typeof en.mergeEditor.rebase].match(/{{[^}]+}}/g) ?? []);
      }
      for (const value of Object.values(labels)) {
        expect(value).toBeTruthy();
        expect(value).not.toMatch(/mergeEditor\.|{{|undefined|null/);
      }
      expect(labels.theirsIncoming).toContain("bbbbbbb · Replay this change");
      expect(labels.explanation).toContain("aaaaaaa");
      expect(labels.theirsIncoming).not.toContain("feature");
      expect(labels.takeOursHint).toContain("1");
      expect(labels.takeTheirsHint).toContain("2");
    });
  }
});
