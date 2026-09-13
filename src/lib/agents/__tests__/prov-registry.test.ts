import { describe, expect, it } from "vitest";

import { agentProvider, chatCapableAgentProviders, isKnownAgentProvider } from "@/lib/agents/provider-registry";
import { AGENT_PROVIDERS as PROVIDER_META } from "@/lib/agents/provider-meta";

describe("provider registry as single source of truth", () => {
  it("resolves unknown providers as explicitly unavailable", () => {
    expect(isKnownAgentProvider("does-not-exist")).toBe(false);
    expect(agentProvider("does-not-exist")).toBeUndefined();
  });

  it("derives provider-meta's chat providers from the registry, not a parallel list", () => {
    const chatIds = chatCapableAgentProviders().map((provider) => provider.id);
    for (const entry of PROVIDER_META) {
      expect(chatIds).toContain(entry.value);
    }
  });
});
