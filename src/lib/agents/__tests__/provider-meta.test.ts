import { describe, expect, it } from "vitest";

import {
  AGENT_PROVIDERS,
  UNSUPPORTED_SLASH_COMMANDS,
  agentProviderMeta,
  providerSupportsSlashCommand,
} from "@/lib/agents/provider-meta";

describe("agentProviderMeta", () => {
  it("resolves every registered provider", () => {
    for (const entry of AGENT_PROVIDERS) {
      expect(agentProviderMeta(entry.value).value).toBe(entry.value);
    }
  });

  it("falls back to the first provider for unknown ids", () => {
    expect(agentProviderMeta("nope" as never).value).toBe(AGENT_PROVIDERS[0].value);
  });
});

describe("providerSupportsSlashCommand", () => {
  it("keeps every command available for codex", () => {
    expect(UNSUPPORTED_SLASH_COMMANDS.codex).toHaveLength(0);
    expect(providerSupportsSlashCommand("codex", "memories")).toBe(true);
    expect(providerSupportsSlashCommand("codex", "stop")).toBe(true);
  });

  it("hides codex-only commands from other providers", () => {
    for (const provider of ["claude", "opencode", "cursor"] as const) {
      for (const command of ["apps", "memories", "import", "fast", "personality", "usage"]) {
        expect(providerSupportsSlashCommand(provider, command)).toBe(false);
      }
    }
  });

  it("hides background-terminal commands where the store is a no-op", () => {
    expect(providerSupportsSlashCommand("claude", "ps")).toBe(true);
    expect(providerSupportsSlashCommand("claude", "stop")).toBe(true);
    for (const provider of ["opencode", "cursor"] as const) {
      expect(providerSupportsSlashCommand(provider, "ps")).toBe(false);
      expect(providerSupportsSlashCommand(provider, "stop")).toBe(false);
    }
  });

  it("keeps shared commands available everywhere", () => {
    for (const entry of AGENT_PROVIDERS) {
      for (const command of ["new", "rename", "review", "model", "delete"]) {
        expect(providerSupportsSlashCommand(entry.value, command)).toBe(true);
      }
    }
  });
});
