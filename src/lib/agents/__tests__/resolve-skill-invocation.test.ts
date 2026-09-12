import { describe, expect, it } from "vitest";

import { resolveSkillInvocation } from "@/lib/agents/capability-hub";

describe("resolveSkillInvocation", () => {
  const skills = [
    { name: "review", enabled: true },
    { name: "manual-only", enabled: true, allowImplicitInvocation: false },
    { name: "off", enabled: false },
  ];

  it("parses a skill mention with args and attachments", () => {
    const result = resolveSkillInvocation("/review please check this @file1.png @file2.txt", skills);
    if ("error" in result) throw new Error("expected success");
    expect(result.skill.name).toBe("review");
    expect(result.args).toBe("please check this");
    expect(result.attachments).toEqual(["file1.png", "file2.txt"]);
    expect(result.manualOnly).toBe(false);
  });

  it("errors on unknown skill instead of falling through to plain text", () => {
    const result = resolveSkillInvocation("/doesnotexist hello", skills);
    expect("error" in result).toBe(true);
  });

  it("errors on disabled skill", () => {
    const result = resolveSkillInvocation("/off hello", skills);
    expect("error" in result).toBe(true);
  });

  it("flags manual-invocation-only skills", () => {
    const result = resolveSkillInvocation("/manual-only go", skills);
    if ("error" in result) throw new Error("expected success");
    expect(result.manualOnly).toBe(true);
  });

  it("errors when input is not a skill invocation", () => {
    const result = resolveSkillInvocation("plain text", skills);
    expect("error" in result).toBe(true);
  });
});
