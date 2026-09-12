import { describe, expect, it } from "vitest";

import { toolItem } from "@/lib/agents/providers/claude/chat-store";

describe("TASK-02 subagent model/effort/role/title", () => {
  it("prefers an explicit agent override over the session default and labels the value accordingly", () => {
    const explicit = toolItem(
      {
        type: "tool_use",
        name: "Task",
        id: "tu-1",
        input: { model: "claude-opus-4", subagent_type: "reviewer", description: "Review PR", effort: "high" },
      },
      "item-0",
      "claude-sonnet-4",
    );
    expect(explicit).toMatchObject({
      model: "claude-opus-4",
      modelSource: "explicit",
      role: "reviewer",
      title: "Review PR",
      effort: "high",
    });
  });

  it("falls back to the parent thread's model but marks it as inherited, and tolerates a missing title", () => {
    const fallback = toolItem(
      { type: "tool_use", name: "Task", id: "tu-2", input: { subagent_type: "explorer" } },
      "item-1",
      "claude-sonnet-4",
    );
    expect(fallback).toMatchObject({
      model: "claude-sonnet-4",
      modelSource: "inherited",
      role: "explorer",
    });
    expect(fallback.title).toBeUndefined();
  });
});
