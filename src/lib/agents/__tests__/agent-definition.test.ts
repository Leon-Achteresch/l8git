import { describe, expect, it } from "vitest";

import { parseAgentDefinition, validateAgentDraft } from "@/lib/agents/capability-store";
import type { AgentModelOption } from "@/lib/agents/types";

function model(id: string): AgentModelOption {
  return {
    id,
    label: id,
    description: "",
    isDefault: false,
    inputModalities: [],
    reasoningEfforts: [],
    defaultReasoningEffort: "medium",
    serviceTiers: [],
    defaultServiceTier: null,
    supportsPersonality: false,
  };
}

describe("parseAgentDefinition", () => {
  it("parses frontmatter and body", () => {
    const md = "---\nname: reviewer\ndescription: Reviews code\nmodel: sonnet\ntools:\n  - Read\n  - Edit\n---\nDo the review.";
    const result = parseAgentDefinition(md);
    if ("error" in result) throw new Error("expected success");
    expect(result.name).toBe("reviewer");
    expect(result.model).toBe("sonnet");
    expect(result.tools).toEqual(["Read", "Edit"]);
    expect(result.instructions).toBe("Do the review.");
  });

  it("errors on missing frontmatter", () => {
    const result = parseAgentDefinition("no frontmatter here");
    expect("error" in result).toBe(true);
  });
});

describe("validateAgentDraft", () => {
  const catalog = [model("sonnet"), model("opus")];

  it("accepts a valid draft", () => {
    const result = validateAgentDraft({ name: "reviewer", model: "sonnet", tools: ["Read"], scope: "project" }, catalog);
    expect(result.valid).toBe(true);
  });

  it("rejects a model missing from the catalog", () => {
    const result = validateAgentDraft({ name: "reviewer", model: "nonexistent", scope: "project" }, catalog);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects an empty tool name", () => {
    const result = validateAgentDraft({ name: "reviewer", tools: [""], scope: "project" }, catalog);
    expect(result.valid).toBe(false);
  });

  it("rejects an invalid scope", () => {
    const result = validateAgentDraft({ name: "reviewer", scope: "bogus" as never, tools: undefined }, catalog);
    expect(result.valid).toBe(false);
  });
});
