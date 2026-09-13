import { describe, expect, it } from "vitest";

import {
  applyCapabilityImport,
  previewCapabilityImport,
  validateCommandDraft,
  validateSkillDraft,
} from "@/lib/agents/capability-store";

describe("validateSkillDraft", () => {
  it("requires a valid identifier name, a description, and rejects collisions", () => {
    expect(validateSkillDraft({ name: "", description: "" }).valid).toBe(false);
    expect(validateSkillDraft({ name: "Bad Name", description: "x" }).valid).toBe(false);
    expect(validateSkillDraft({ name: "review", description: "x" }, ["review"]).valid).toBe(false);
    expect(validateSkillDraft({ name: "review", description: "x" }).valid).toBe(true);
  });
});

describe("validateCommandDraft", () => {
  it("requires a name and non-empty body", () => {
    expect(validateCommandDraft({ name: "ship", body: "" }).valid).toBe(false);
    expect(validateCommandDraft({ name: "ship", body: "do it" }).valid).toBe(true);
  });
});

describe("previewCapabilityImport / applyCapabilityImport", () => {
  it("creates, updates, skips no-ops, and flags kind conflicts, applying only creates and updates", async () => {
    const source = [
      { id: "a", kind: "skill", hash: "1" },
      { id: "b", kind: "skill", hash: "2" },
      { id: "c", kind: "skill", hash: "3" },
      { id: "d", kind: "mcp", hash: "4" },
    ];
    const target = [
      { id: "b", kind: "skill", hash: "old" },
      { id: "c", kind: "skill", hash: "3" },
      { id: "d", kind: "command", hash: "4" },
    ];
    const preview = previewCapabilityImport(source, target);
    expect(preview.creates).toEqual([{ id: "a", kind: "skill", hash: "1" }]);
    expect(preview.updates).toEqual([{ id: "b", kind: "skill", hash: "2" }]);
    expect(preview.conflicts).toEqual([{ id: "d", kind: "mcp", hash: "4" }]);

    const applied: string[] = [];
    await applyCapabilityImport(preview, (item) => {
      applied.push(item.id);
    });
    expect(applied).toEqual(["a", "b"]);
  });

  it("treats two missing hashes as a conflict, not a no-op", () => {
    const source = [{ id: "e", kind: "skill" }];
    const target = [{ id: "e", kind: "skill" }];
    const preview = previewCapabilityImport(source, target);
    expect(preview.creates).toEqual([]);
    expect(preview.updates).toEqual([]);
    expect(preview.conflicts).toEqual([{ id: "e", kind: "skill" }]);
  });
});
