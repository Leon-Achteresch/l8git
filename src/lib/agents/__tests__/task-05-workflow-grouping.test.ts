import { describe, expect, it } from "vitest";

import { groupWorkflowTasks } from "@/lib/agents/providers/claude/chat-store";
import type { AgentTurn } from "@/lib/agents/types";

describe("TASK-05 workflow members, phases and fanout grouping", () => {
  it("groups subagent tasks by their parent tool call and keeps an unknown workflow shape as a generic group", () => {
    const turn: AgentTurn = {
      id: "turn-1",
      status: "inProgress",
      items: [
        { id: "t1", type: "collabAgentToolCall", parentToolUseId: "tu-a", phase: "Plan", toolUseId: "tu-a" },
        { id: "t2", type: "collabAgentToolCall", parentToolUseId: "tu-a", toolUseId: "tu-a2" },
        { id: "t3", type: "collabAgentToolCall", parentToolUseId: "tu-b", phase: "Build", toolUseId: "tu-b" },
        { id: "orphan", type: "collabAgentToolCall", toolUseId: "tu-c" },
        { id: "text-1", type: "agentMessage", text: "hi" },
      ],
    };

    const groups = groupWorkflowTasks(turn);

    expect(groups).toHaveLength(3);
    const plan = groups.find((group) => group.parentToolUseId === "tu-a");
    expect(plan?.phase).toBe("Plan");
    expect(plan?.tasks).toHaveLength(2);

    const build = groups.find((group) => group.parentToolUseId === "tu-b");
    expect(build?.phase).toBe("Build");

    const orphan = groups.find((group) => group.parentToolUseId === "tu-c");
    expect(orphan?.phase).toBe("Allgemein");
    expect(orphan?.tasks).toHaveLength(1);
  });
});
