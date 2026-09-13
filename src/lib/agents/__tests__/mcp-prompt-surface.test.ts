import { describe, expect, it } from "vitest";

import { mcpSurfaceCapability, promptToComposerText, type AgentMcpPrompt } from "@/lib/agents/capability-types";

describe("mcp surface inventory", () => {
  it("documents notifications and resource-links as their own surfaces", () => {
    expect(mcpSurfaceCapability("notifications", "claude").status).toBe("unsupported");
    expect(mcpSurfaceCapability("resourceLinks", "claude").status).toBe("unsupported");
  });

  it("returns a protocol-shaped error for an unknown method instead of throwing", () => {
    expect(() => mcpSurfaceCapability("elicitation" as never, "stub-mcp")).not.toThrow();
    const result = mcpSurfaceCapability("elicitation" as never, "stub-mcp");
    expect(result.status).toBe("unsupported");
    expect(result.reason).toContain("unknown driver");
  });

  it("distinguishes an unknown surface from an unknown driver for a known driver", () => {
    const result = mcpSurfaceCapability("not-a-real-surface" as never, "claude");
    expect(result.status).toBe("unsupported");
    expect(result.reason).toContain("unknown surface");
  });
});

describe("promptToComposerText", () => {
  it("turns an MCP prompt with resolved arguments into composer text", () => {
    const prompt: AgentMcpPrompt = {
      name: "summarize",
      description: "Summarize the given text",
      arguments: [{ name: "text", required: true }],
    };
    const text = promptToComposerText(prompt, { text: "hello world" });
    expect(text).toContain("Summarize the given text");
    expect(text).toContain("text: hello world");
  });

  it("omits unresolved values as empty rather than crashing", () => {
    const prompt: AgentMcpPrompt = { name: "empty", arguments: [{ name: "topic" }] };
    const text = promptToComposerText(prompt, {});
    expect(text).toBe("topic:");
  });
});
