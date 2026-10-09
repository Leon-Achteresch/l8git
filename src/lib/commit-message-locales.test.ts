import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import de from "@/locales/de.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import pt from "@/locales/pt.json";
import zh from "@/locales/zh.json";
import ja from "@/locales/ja.json";
import { COMMIT_TYPES, inspectCommitMessage } from "./commit-message";

function copyLeaves(value: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof entry === "string" ? [[path, entry]] : Object.entries(copyLeaves(entry as Record<string, unknown>, path));
  }));
}

describe("dynamic commit guidance translations", () => {
  for (const [code, locale] of Object.entries({ en, de, es, fr, pt, zh, ja })) {
    it(`${code} supplies type, insight and preflight labels and detectable template hints`, () => {
      const guidance = locale.commitGuidance;
      for (const type of COMMIT_TYPES) expect(guidance.types[type]).toBeTruthy();
      expect(Object.keys(guidance.insights).sort()).toEqual(Object.keys(en.commitGuidance.insights).sort());
      expect(Object.keys(guidance.preflight).sort()).toEqual(Object.keys(en.commitGuidance.preflight).sort());
      for (const template of Object.values(guidance.templates)) {
        expect(template.label).toBeTruthy();
        expect(inspectCommitMessage("feat: add login", template.body).insights.map((insight) => insight.code)).toContain("placeholder");
      }
      expect(guidance.templates.breaking.body).toContain("BREAKING CHANGE:");
      expect(Object.keys(locale.commitActions).sort()).toEqual(Object.keys(en.commitActions).sort());
    });
    it(`${code} preserves translated action and finish placeholders`, () => {
      for (const namespace of ["commitActions", "agentReviewFinish"] as const) {
        const expected = copyLeaves(en[namespace]);
        const copy = copyLeaves(locale[namespace]);
        expect(Object.keys(copy).sort()).toEqual(Object.keys(expected).sort());
        for (const [key, value] of Object.entries(copy)) {
          expect(value.trim()).not.toBe("");
          expect(value.match(/{{[^}]+}}/g)?.sort() ?? []).toEqual(expected[key].match(/{{[^}]+}}/g)?.sort() ?? []);
        }
      }
    });
  }
});
