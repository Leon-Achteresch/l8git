import { describe, expect, it } from "vitest";
import { routeSlashCommand } from "@/lib/agents/slash-commands";
import type { AgentCapability } from "@/lib/agents/types";

const supported: AgentCapability = { status: "supported" };
const unsupported: AgentCapability = { status: "unsupported", reason: "no" };

describe("CHAT-08 routeSlashCommand", () => {
  it("routes a native command with supported capability", () => {
    const result = routeSlashCommand("/compact", "claude", { resolveCapability: () => supported });
    expect(result).toEqual({ kind: "native", name: "compact", args: "" });
  });

  it("does not let an app alias swallow a colliding native command", () => {
    const result = routeSlashCommand("/clear", "claude", { resolveCapability: () => supported });
    expect(result.kind).toBe("native");
    expect(result.name).toBe("clear");
  });

  it("routes an unknown slash command", () => {
    const result = routeSlashCommand("/not-a-real-command arg", "claude", { resolveCapability: () => supported });
    expect(result).toEqual({ kind: "unknown", name: "not-a-real-command", args: "arg" });
  });

  it("routes to unknown when the native command capability is not supported", () => {
    const result = routeSlashCommand("/compact", "claude", { resolveCapability: () => unsupported });
    expect(result.kind).toBe("unknown");
  });

  it("preserves quoted argument text", () => {
    const result = routeSlashCommand('/goal "ship the feature"', "claude", { resolveCapability: () => supported });
    expect(result.args).toBe('"ship the feature"');
  });

  it("routes app-only commands regardless of native inventory", () => {
    const result = routeSlashCommand("/marketplace", "claude", { resolveCapability: () => unsupported });
    expect(result.kind).toBe("app");
  });
});
