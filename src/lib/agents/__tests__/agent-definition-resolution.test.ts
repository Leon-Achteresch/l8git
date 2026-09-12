import { describe, expect, it } from "vitest";

import {
  parseAgentDefinition,
  resolveAgentDefinitions,
  type AgentDefinitionCandidate,
} from "@/lib/agents/capability-store";

describe("parseAgentDefinition extra fields", () => {
  it("keeps CLI-only frontmatter fields instead of dropping them", () => {
    const md =
      "---\nname: reviewer\ndescription: Reviews code\npermission-mode: acceptEdits\ncolor: blue\n---\nDo the review.";
    const result = parseAgentDefinition(md);
    if ("error" in result) throw new Error("expected success");
    expect(result.extraFields["permission-mode"]).toBe("acceptEdits");
    expect(result.extraFields.color).toBe("blue");
  });
});

describe("resolveAgentDefinitions", () => {
  it("flags an invalid definition and prefers the valid repo-scope definition with the same name", () => {
    const candidates: AgentDefinitionCandidate[] = [
      { scope: "project", name: "reviewer", valid: true },
      { scope: "user", name: "reviewer", valid: false, issues: ["unknown optional field: color"] },
    ];
    const resolution = resolveAgentDefinitions(candidates);
    expect(resolution.effective?.scope).toBe("project");
    expect(resolution.flagged).toHaveLength(1);
    expect(resolution.flagged[0]?.scope).toBe("user");
  });

  it("does not silently fall back to a default agent when no candidate is valid", () => {
    const candidates: AgentDefinitionCandidate[] = [
      { scope: "project", name: "reviewer", valid: false, issues: ["malformed frontmatter"] },
    ];
    const resolution = resolveAgentDefinitions(candidates);
    expect(resolution.effective).toBeNull();
    expect(resolution.flagged).toHaveLength(1);
  });
});
