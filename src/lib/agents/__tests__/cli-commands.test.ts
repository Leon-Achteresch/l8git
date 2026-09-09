import { describe, expect, it } from "vitest";

import { buildClaudeLaunchArgs, buildTerminalHandoffCommand } from "@/lib/agents/cli-commands";

describe("buildClaudeLaunchArgs", () => {
  it("replaces the system prompt", () => {
    const result = buildClaudeLaunchArgs({
      systemPrompt: "be terse",
      settingSources: [],
      trusted: false,
    });
    expect(result.args).toEqual(["--system-prompt", "be terse"]);
  });

  it("appends the system prompt", () => {
    const result = buildClaudeLaunchArgs({
      appendSystemPrompt: "also be terse",
      settingSources: [],
      trusted: false,
    });
    expect(result.args).toEqual(["--append-system-prompt", "also be terse"]);
  });

  it("throws when both systemPrompt and appendSystemPrompt are set", () => {
    expect(() =>
      buildClaudeLaunchArgs({
        systemPrompt: "a",
        appendSystemPrompt: "b",
        settingSources: [],
        trusted: false,
      }),
    ).toThrow();
  });

  it("filters project and local setting sources for untrusted repos and reports a warning", () => {
    const result = buildClaudeLaunchArgs({
      settingSources: ["user", "project", "local", "managed"],
      trusted: false,
    });
    expect(result.args).toEqual(["--setting-sources", "user,managed"]);
    expect(result.warnings).toEqual([
      'setting source "project" filtered: repository is not trusted',
      'setting source "local" filtered: repository is not trusted',
    ]);
  });

  it("keeps project and local setting sources for trusted repos", () => {
    const result = buildClaudeLaunchArgs({
      settingSources: ["user", "project", "local"],
      trusted: true,
    });
    expect(result.args).toEqual(["--setting-sources", "user,project,local"]);
    expect(result.warnings).toEqual([]);
  });
});

describe("buildTerminalHandoffCommand", () => {
  it("builds resume args and moves the config dir into env", () => {
    const result = buildTerminalHandoffCommand({
      binaryPath: "/usr/local/bin/claude",
      cwd: "/repo",
      sessionId: "session-123",
      configDir: "/home/user/.claude",
    });
    expect(result.command).toBe("/usr/local/bin/claude");
    expect(result.args).toEqual(["--resume", "session-123"]);
    expect(result.env.CLAUDE_CONFIG_DIR).toBe("/home/user/.claude");
  });

  it("builds a debug launch and never puts secrets into args", () => {
    const result = buildTerminalHandoffCommand({
      binaryPath: "/usr/local/bin/claude",
      cwd: "/repo",
      debug: true,
      secretEnv: { ANTHROPIC_API_KEY: "sk-ant-secret" },
    });
    expect(result.args).toEqual(["--debug"]);
    expect(result.args.join(" ")).not.toContain("sk-ant-secret");
    expect(result.env.ANTHROPIC_API_KEY).toBe("sk-ant-secret");
  });

  it("requires a binary path", () => {
    expect(() => buildTerminalHandoffCommand({ binaryPath: "", cwd: "/repo" })).toThrow();
  });

  it("requires a cwd", () => {
    expect(() => buildTerminalHandoffCommand({ binaryPath: "/usr/local/bin/claude", cwd: "" })).toThrow();
  });
});
