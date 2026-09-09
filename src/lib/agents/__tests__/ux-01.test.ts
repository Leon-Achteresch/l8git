import { describe, expect, it } from "vitest";

import { providerInstanceOptions, type AgentProviderInstance } from "@/lib/agents/provider-store";

function instance(overrides: Partial<AgentProviderInstance> & { id: string }): AgentProviderInstance {
  return {
    driver: "claude",
    label: "",
    enabled: true,
    isDefault: false,
    config: {},
    ...overrides,
  };
}

describe("providerInstanceOptions", () => {
  const registry = [
    { value: "claude" as const, label: "Claude", description: "Anthropic's Claude" },
    { value: "codex" as const, label: "Codex", description: "OpenAI's Codex" },
  ];

  it("maps driver, label, description and readiness for each instance", () => {
    const options = providerInstanceOptions(registry, [
      instance({ id: "claude:default", driver: "claude", label: "Work", enabled: true }),
      instance({ id: "codex:default", driver: "codex", label: "", enabled: false }),
    ]);
    expect(options).toEqual([
      {
        value: "claude:default",
        driver: "claude",
        label: "Work",
        description: "Anthropic's Claude",
        readiness: "ready",
      },
      {
        value: "codex:default",
        driver: "codex",
        label: "Codex",
        description: "OpenAI's Codex",
        readiness: "disabled",
      },
    ]);
  });

  it("falls back safely for an unknown driver in old history", () => {
    const options = providerInstanceOptions(registry, [
      instance({ id: "mystery:default", driver: "mystery" as never, label: "", enabled: true }),
    ]);
    expect(options[0]).toMatchObject({ label: "mystery", description: "" });
  });
});
