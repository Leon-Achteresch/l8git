import { describe, expect, it } from "vitest";

import { buildClaudeLaunchArgs } from "@/lib/agents/cli-commands";

describe("CLI-08 tool policies and MCP config", () => {
  it("builds allowedTools, disallowedTools, strict-mcp-config and mcp-config flags", () => {
    const result = buildClaudeLaunchArgs({
      settingSources: [],
      trusted: false,
      allowedTools: ["Read", "Grep"],
      disallowedTools: ["Bash"],
      strictMcpConfig: true,
      mcpConfigPaths: ["./a.json", "./b.json"],
    });
    expect(result.args).toEqual([
      "--allowedTools",
      "Read,Grep",
      "--disallowedTools",
      "Bash",
      "--strict-mcp-config",
      "--mcp-config",
      "./a.json",
      "--mcp-config",
      "./b.json",
    ]);
  });

  it("rejects overlapping allowedTools and disallowedTools", () => {
    expect(() =>
      buildClaudeLaunchArgs({
        settingSources: [],
        trusted: false,
        allowedTools: ["Bash"],
        disallowedTools: ["Bash"],
      }),
    ).toThrow();
  });
});
