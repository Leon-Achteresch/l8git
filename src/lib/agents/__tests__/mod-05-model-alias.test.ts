import { describe, expect, it } from "vitest";
import { resolveModelAlias, resolveModelFallback } from "@/lib/agents/model-catalog";

describe("MOD-05 aliases and custom model ids", () => {
  it("resolves known aliases to their concrete id", () => {
    expect(resolveModelAlias("opus", [])).toEqual({ kind: "alias", alias: "opus", id: "claude-opus-4" });
    expect(resolveModelAlias("sonnet", [])).toEqual({ kind: "alias", alias: "sonnet", id: "claude-sonnet-4" });
    expect(resolveModelAlias("haiku", [])).toEqual({ kind: "alias", alias: "haiku", id: "claude-haiku-4" });
  });

  it("keeps an unknown id opaque as custom even if it collides with a name", () => {
    const catalog = [{ id: "claude-opus-4" }];
    const result = resolveModelAlias("router/my-custom-opus", catalog);
    expect(result).toEqual({ kind: "custom", id: "router/my-custom-opus" });
  });

  it("recognizes a known catalog id without treating it as an alias", () => {
    const catalog = [{ id: "claude-sonnet-4" }];
    expect(resolveModelAlias("claude-sonnet-4", catalog)).toEqual({ kind: "known", id: "claude-sonnet-4" });
  });

  it("shows an explicit fallback model as requested vs used", () => {
    const result = resolveModelFallback({ requested: "claude-opus-4", configuredFallback: "claude-sonnet-4" });
    expect(result).toEqual({
      requested: "claude-opus-4",
      used: "claude-sonnet-4",
      isFallback: true,
      fallbackReason: "explicit",
    });
  });

  it("surfaces a provider-reported refusal fallback distinctly and never silently", () => {
    const result = resolveModelFallback({
      requested: "claude-opus-4",
      configuredFallback: "claude-sonnet-4",
      providerRefusalFallback: "claude-haiku-4",
    });
    expect(result.used).toBe("claude-haiku-4");
    expect(result.fallbackReason).toBe("provider_refusal");
    expect(result.requested).toBe("claude-opus-4");
  });

  it("reports no fallback when the used model matches the requested model", () => {
    const result = resolveModelFallback({ requested: "claude-opus-4" });
    expect(result.isFallback).toBe(false);
    expect(result.used).toBe("claude-opus-4");
  });
});
