import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";

import { AiError, generateAiText, toAiError, truncateForPrompt } from "@/lib/ai/core";
import { migratePromptPrefs, sanitizePromptOverrides } from "@/lib/ai/prompt-prefs";
import {
  AI_FEATURES,
  AI_PROMPT_TEMPLATES,
  defaultPromptTemplate,
  renderTemplate,
  templatePlaceholdersUsed,
} from "@/lib/ai/prompts";

function textModel(text: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: text ? [{ type: "text" as const, text }] : [],
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
        totalTokens: 2,
      },
      warnings: [],
    }),
  });
}

function failingModel(error: unknown): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      throw error;
    },
  });
}

describe("renderTemplate", () => {
  it("replaces known placeholders", () => {
    expect(renderTemplate("a {{one}} b {{two}}", { one: "1", two: 2 })).toBe("a 1 b 2");
  });

  it("tolerates whitespace inside the braces and repeated placeholders", () => {
    expect(renderTemplate("{{ diff }} / {{diff}}", { diff: "D" })).toBe("D / D");
  });

  it("drops placeholders without a value", () => {
    expect(renderTemplate("x{{missing}}y", { other: "z" })).toBe("xy");
    expect(renderTemplate("x{{empty}}y", { empty: null })).toBe("xy");
  });

  it("keeps dollar sequences of the replacement literal", () => {
    expect(renderTemplate("{{diff}}", { diff: "cost $1 and $& and $`" })).toBe(
      "cost $1 and $& and $`",
    );
  });

  it("leaves text without placeholders untouched", () => {
    expect(renderTemplate("plain { text } {{{}}", {})).toBe("plain { text } {{{}}");
  });

  it("exposes the placeholders a template actually uses", () => {
    expect(templatePlaceholdersUsed("{{a}} {{b}} {{a}}").sort()).toEqual(["a", "b"]);
  });

  it("ships a default template for every feature that only uses declared placeholders", () => {
    for (const feature of AI_FEATURES) {
      const def = AI_PROMPT_TEMPLATES[feature];
      expect(def.defaultTemplate.trim().length).toBeGreaterThan(0);
      for (const used of templatePlaceholdersUsed(def.defaultTemplate)) {
        expect(def.placeholders).toContain(used);
      }
    }
  });
});

describe("generateAiText error mapping", () => {
  it("returns the model text", async () => {
    await expect(
      generateAiText({ feature: "explainDiff", prompt: "p", model: textModel("hello") }),
    ).resolves.toBe("hello");
  });

  it("appends the hint to the prompt", async () => {
    const model = textModel("ok");
    await generateAiText({
      feature: "commitMessage",
      prompt: "base prompt",
      hint: "shorter please",
      model,
    });
    const call = model.doGenerateCalls[0];
    const serialized = JSON.stringify(call.prompt);
    expect(serialized).toContain("base prompt");
    expect(serialized).toContain("shorter please");
  });

  it("maps an empty answer", async () => {
    const error = await generateAiText({
      feature: "explainDiff",
      prompt: "p",
      model: textModel("   "),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).kind).toBe("empty");
    expect((error as AiError).feature).toBe("explainDiff");
  });

  it("maps network failures", async () => {
    const error = await generateAiText({
      feature: "prDescription",
      prompt: "p",
      model: failingModel(new TypeError("fetch failed")),
    }).catch((e: unknown) => e);
    expect((error as AiError).kind).toBe("network");
  });

  it("maps connection refused as network failure", async () => {
    const error = await generateAiText({
      feature: "prDescription",
      prompt: "p",
      model: failingModel(new Error("connect ECONNREFUSED 127.0.0.1:11434")),
    }).catch((e: unknown) => e);
    expect((error as AiError).kind).toBe("network");
  });

  it("maps an already aborted signal without calling the model", async () => {
    const controller = new AbortController();
    controller.abort();
    const model = textModel("never");
    const error = await generateAiText({
      feature: "explainCommit",
      prompt: "p",
      signal: controller.signal,
      model,
    }).catch((e: unknown) => e);
    expect((error as AiError).kind).toBe("aborted");
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("maps an abort during the call", async () => {
    const controller = new AbortController();
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        controller.abort();
        throw new Error("The operation was aborted");
      },
    });
    const error = await generateAiText({
      feature: "explainBranch",
      prompt: "p",
      signal: controller.signal,
      model,
    }).catch((e: unknown) => e);
    expect((error as AiError).kind).toBe("aborted");
  });

  it("falls back to unknown for other failures", async () => {
    const error = await generateAiText({
      feature: "conflictResolution",
      prompt: "p",
      model: failingModel(new Error("model refused")),
    }).catch((e: unknown) => e);
    expect((error as AiError).kind).toBe("unknown");
    expect((error as AiError).message).toBe("model refused");
  });

  it("passes AiError instances through unchanged", () => {
    const original = new AiError("noApiKey", "no key");
    expect(toAiError(original)).toBe(original);
  });

  it("truncates long prompt input", () => {
    expect(truncateForPrompt("  abcdef  ", 3)).toBe("abc");
    expect(truncateForPrompt("  abc  ", 10)).toBe("abc");
  });
});

describe("prompt prefs migration", () => {
  it("adopts the legacy commit prompt on first run", () => {
    const result = migratePromptPrefs(null, "legacy commit prompt");
    expect(result.overrides.commitMessage).toBe("legacy commit prompt");
    expect(result.migratedLegacyCommitPrompt).toBe(true);
  });

  it("does not overwrite an existing override", () => {
    const result = migratePromptPrefs(
      { overrides: { commitMessage: "mine" } },
      "legacy commit prompt",
    );
    expect(result.overrides.commitMessage).toBe("mine");
  });

  it("does not re-adopt the legacy prompt after a reset", () => {
    const result = migratePromptPrefs(
      { overrides: {}, migratedLegacyCommitPrompt: true },
      "legacy commit prompt",
    );
    expect(result.overrides.commitMessage).toBeUndefined();
  });

  it("ignores an empty legacy value", () => {
    expect(migratePromptPrefs(null, "   ").overrides).toEqual({});
    expect(migratePromptPrefs(null, undefined).overrides).toEqual({});
  });

  it("keeps repo overrides and drops malformed entries", () => {
    const result = migratePromptPrefs(
      {
        overrides: { explainDiff: "custom", bogus: "x", prDescription: 42, explainCommit: " " },
        repoOverrides: { "/repo": "repo prompt", "/other": 7 },
        migratedLegacyCommitPrompt: true,
      },
      undefined,
    );
    expect(result.overrides).toEqual({ explainDiff: "custom" });
    expect(result.repoOverrides).toEqual({ "/repo": "repo prompt" });
  });

  it("sanitizes unknown persisted shapes", () => {
    expect(sanitizePromptOverrides(null)).toEqual({});
    expect(sanitizePromptOverrides("nope")).toEqual({});
  });

  it("keeps the commit message default identical to the exported legacy default", async () => {
    const { DEFAULT_AI_PROMPT_TEMPLATE } = await import("@/lib/ai-commit");
    expect(DEFAULT_AI_PROMPT_TEMPLATE).toBe(defaultPromptTemplate("commitMessage"));
  });
});
