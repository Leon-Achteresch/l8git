import { describe, expect, it } from "vitest";

import { applyToolResult, toolItem } from "@/lib/agents/providers/claude/chat-store";
import type { AgentTurn } from "@/lib/agents/types";

function turnWith(item: ReturnType<typeof toolItem>): AgentTurn {
  return { id: "turn-1", items: [item], status: "inProgress" };
}

describe("EVT-06 bash tool rendering", () => {
  it("splits command, cwd, stdout and stderr instead of merging them", () => {
    const item = toolItem({ name: "Bash", input: { command: "ls -la", cwd: "/repo" }, id: "tu-1" }, "item-1");
    expect(item.command).toBe("ls -la");
    expect(item.cwd).toBe("/repo");
    expect(item.stdout).toBe("");
    expect(item.stderr).toBe("");
    expect(item.exitCode).toBeNull();

    const next = applyToolResult(turnWith(item), {
      tool_use_id: "tu-1",
      is_error: false,
      content: "out",
    }, { stdout: "out", stderr: "warn: something" });

    expect(next.items[0].stdout).toBe("out");
    expect(next.items[0].stderr).toBe("warn: something");
    expect(next.items[0].status).toBe("completed");
    expect(next.items[0].exitCode).toBe(0);
  });

  it("marks an interrupted run as aborted rather than failed", () => {
    const item = toolItem({ name: "Bash", input: { command: "sleep 100" }, id: "tu-1" }, "item-1");
    const next = applyToolResult(turnWith(item), {
      tool_use_id: "tu-1",
      is_error: true,
      content: "interrupted",
    }, { interrupted: true, stdout: "", stderr: "" });
    expect(next.items[0].status).toBe("aborted");
  });

  it("marks a genuine failure distinctly from an aborted or detached run", () => {
    const item = toolItem({ name: "Bash", input: { command: "false" }, id: "tu-1" }, "item-1");
    const next = applyToolResult(turnWith(item), {
      tool_use_id: "tu-1",
      is_error: true,
      content: "boom",
    }, { stdout: "", stderr: "boom" });
    expect(next.items[0].status).toBe("failed");
    expect(next.items[0].exitCode).toBe(1);
  });

  it("keeps a background run detached instead of completed once the launch result lands", () => {
    const item = toolItem(
      { name: "Bash", input: { command: "npm run dev", run_in_background: true }, id: "tu-1" },
      "item-1",
    );
    expect(item.background).toBe(true);
    const next = applyToolResult(turnWith(item), {
      tool_use_id: "tu-1",
      is_error: false,
      content: "started",
    });
    expect(next.items[0].status).toBe("detached");
  });
});
