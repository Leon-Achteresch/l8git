import { describe, expect, it } from "vitest";

import {
  commandName,
  isNativeSlashCommand,
  mergeCliCommands,
  mergeSlashCommands,
  nativeSlashCommands,
  shouldRunNativeSlash,
  slashCommandLine,
} from "@/lib/agents/slash-commands";

describe("slash commands", () => {
  it("strips a leading slash and builds a prompt line", () => {
    expect(commandName("/review")).toBe("review");
    expect(slashCommandLine("cost", "")).toBe("/cost");
    expect(slashCommandLine("/ship", "main")).toBe("/ship main");
  });

  it("keeps native handlers for the provider that owns them", () => {
    expect(isNativeSlashCommand("usage")).toBe(true);
    expect(shouldRunNativeSlash("usage", "codex")).toBe(true);
    expect(shouldRunNativeSlash("usage", "claude")).toBe(false);
    expect(shouldRunNativeSlash("cost", "claude")).toBe(false);
  });

  it("merges CLI commands under native ones and lets live argument hints win", () => {
    const native = nativeSlashCommands({
      provider: "claude",
      providerLabel: "Claude Code",
      isClaude: true,
      isCodex: false,
      threadId: "t1",
      busy: false,
      conversationExists: true,
      model: null,
      models: [],
      hasTerminalToggle: false,
    });
    expect(native.some((command) => command.value === "usage")).toBe(false);
    expect(native.some((command) => command.value === "model")).toBe(true);

    const cli = mergeCliCommands(
      [{ name: "/ship", description: "Ship it", argumentHint: "[target]" }],
      [{ name: "ship", description: "file fallback", argumentHint: "" }, { name: "model", description: "CLI model", argumentHint: "" }],
    );
    expect(cli).toEqual([
      { name: "ship", description: "Ship it", argumentHint: "[target]" },
      { name: "model", description: "CLI model", argumentHint: "" },
    ]);

    const merged = mergeSlashCommands(native, [
      { name: "ship", description: "Ship it", argumentHint: "[target]" },
      { name: "compact", description: "CLI compact", argumentHint: "" },
    ]);
    expect(merged.find((command) => command.value === "compact")?.label).toBe("Compact context");
    expect(merged.find((command) => command.value === "ship")).toEqual({
      value: "ship",
      label: "Ship it",
      description: "/ship [target]",
      acceptsArgument: true,
    });
  });

  it("offers /variants only on opencode", () => {
    const base = {
      providerLabel: "OpenCode",
      isClaude: false,
      isCodex: false,
      threadId: "t1",
      busy: false,
      conversationExists: true,
      model: "m",
      models: [{ id: "m", label: "M", reasoningEfforts: [{ value: "high", label: "High" }], serviceTiers: [] }],
      hasTerminalToggle: false,
    };
    const opencode = nativeSlashCommands({ ...base, provider: "opencode" } as never);
    expect(opencode.find((command) => command.value === "variants")?.disabled).toBe(false);
    const claude = nativeSlashCommands({ ...base, provider: "claude", isClaude: true } as never);
    expect(claude.some((command) => command.value === "variants")).toBe(false);
  });
});
