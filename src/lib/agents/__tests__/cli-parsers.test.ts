import { describe, expect, it } from "vitest";

import {
  parseCursorMcpServers,
  parseCursorModels,
  parseCursorStatus,
} from "@/lib/agents/providers/cursor/client";
import { parseOpenCodeMcpServers } from "@/lib/agents/providers/opencode/client";

describe("parseCursorModels", () => {
  it("parses id - label lines and strips the default marker", () => {
    const output = [
      "Available models:",
      "",
      "gpt-5.2 - GPT-5.2 (default)",
      "claude-sonnet-4-5 - Claude Sonnet 4.5",
      "composer-1 - Composer - Fast",
    ].join("\n");
    expect(parseCursorModels(output)).toEqual([
      { id: "gpt-5.2", label: "GPT-5.2" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "composer-1", label: "Composer - Fast" },
    ]);
  });

  it("ignores prose and empty output", () => {
    expect(parseCursorModels("")).toEqual([]);
    expect(parseCursorModels("You are not logged in.\nRun cursor-agent login.")).toEqual([]);
  });
});

describe("parseCursorStatus", () => {
  it("extracts the email and login state", () => {
    expect(parseCursorStatus("Logged in as dev@example.com\nPlan: Pro")).toEqual({
      email: "dev@example.com",
      loggedIn: true,
    });
  });

  it("treats 'not logged in' as logged out even with an email present", () => {
    expect(parseCursorStatus("dev@example.com is not logged in")).toEqual({
      email: "dev@example.com",
      loggedIn: false,
    });
  });

  it("handles output without any email", () => {
    expect(parseCursorStatus("Logged out")).toEqual({ email: null, loggedIn: false });
  });
});

describe("parseCursorMcpServers", () => {
  it("parses bullet lists with statuses", () => {
    const output = [
      "Configured MCP servers:",
      "- github  connected",
      "- linear: disabled",
      "• filesystem - connected",
    ].join("\n");
    expect(parseCursorMcpServers(output)).toEqual([
      { name: "github", status: "connected" },
      { name: "linear", status: "disabled" },
      { name: "filesystem", status: "connected" },
    ]);
  });

  it("defaults status to unknown and drops invalid names", () => {
    expect(parseCursorMcpServers("- solo\n- has spaces in name  ok")).toEqual([
      { name: "solo", status: "unknown" },
    ]);
  });

  it("returns nothing for the empty-state message", () => {
    expect(parseCursorMcpServers("No MCP servers configured")).toEqual([]);
  });
});

describe("parseOpenCodeMcpServers", () => {
  it("strips ANSI codes and box-drawing prefixes", () => {
    const output = [
      "MCP Servers",
      "│ [32m●[0m github  connected",
      "│ ○ context7: failed",
      "Add servers with `opencode mcp add`",
    ].join("\n");
    expect(parseOpenCodeMcpServers(output)).toEqual([
      { name: "github", status: "connected" },
      { name: "context7", status: "failed" },
    ]);
  });

  it("returns nothing for the empty-state message", () => {
    expect(parseOpenCodeMcpServers("No MCP servers configured")).toEqual([]);
  });
});
