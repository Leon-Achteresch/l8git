import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { beforeAll, expect, it, vi } from "vitest";
import en from "@/locales/en.json";
import de from "@/locales/de.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import ja from "@/locales/ja.json";
import pt from "@/locales/pt.json";
import zh from "@/locales/zh.json";
import type { IgnoreExplanation } from "@/lib/ignore-explanation";

const rendered = vi.hoisted(() => ({ t: null as unknown as typeof import("i18next").t }));
vi.mock("react-i18next", async (original) => ({ ...await original<typeof import("react-i18next")>(), useTranslation: () => ({ t: rendered.t }) }));
vi.mock("@/lib/platform/ipc", () => ({ invoke: vi.fn() }));
vi.mock("@/components/ui/dialog", () => {
  const element = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return { Dialog: element, DialogContent: element, DialogHeader: element, DialogTitle: element, DialogDescription: element, DialogFooter: element };
});
import { IgnoreExplanationDialog, IgnoreExplanationResult } from "./ignore-explanation-dialog";

beforeAll(async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
  rendered.t = i18n.t;
});

it("provides an explicit input, read-only description and initially disabled check", () => {
  const html = renderToStaticMarkup(createElement(IgnoreExplanationDialog, { path: "/repo", onClose: () => {} }));
  expect(html).toContain(en.ignoreExplanation.description);
  expect(html).toContain("<textarea");
  expect(html).toContain('aria-describedby=');
  expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
});

it("renders ignored, negated and no-match states with exact rule metadata and safe text", () => {
  const base: IgnoreExplanation = { file: " leading 日本語\n--file ", ignored: true, rule: { source: " odd\nrule:file ", line: 12, pattern: "<script>" } };
  for (const result of [base, { ...base, ignored: false, rule: { ...base.rule!, pattern: "!*.txt" } }, { ...base, ignored: false, rule: null }]) {
    const html = renderToStaticMarkup(createElement(IgnoreExplanationResult, { result }));
    expect(html).toContain(result.file);
    expect(html).toContain('role="status"');
    expect(html).toContain(result.ignored ? en.ignoreExplanation.ignored : result.rule ? en.ignoreExplanation.negated : en.ignoreExplanation.noMatch);
    if (result.rule) {
      expect(html).toContain(result.rule.source);
      expect(html).toContain(">12</dd>");
      expect(html).toContain(result.ignored ? "&lt;script&gt;" : "!*.txt");
      expect(html).not.toContain("<script>");
    } else {
      expect(html).toContain(en.ignoreExplanation.noMatchHint);
      expect(html).not.toContain("<dl");
    }
  }
});

it("supplies all diagnosis messages in each existing locale", () => {
  for (const locale of [de, en, es, fr, pt, ja, zh]) {
    expect(Object.keys(locale.ignoreExplanation).sort()).toEqual(Object.keys(en.ignoreExplanation).sort());
    expect(Object.values(locale.ignoreExplanation).every(value => value.length > 0)).toBe(true);
  }
});
