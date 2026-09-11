import { describe, expect, it } from "vitest";

import {
  approvalResult,
  questionAnswerResult,
  threadRowStatus,
  threadRows,
  transcriptEntries,
  usageLimits,
  usageSegments,
} from "@/lib/agents/agents-page";
import type { AgentConversation, AgentPendingRequest, AgentThreadSummary, AgentTurn } from "@/lib/agents/types";

const NOW = new Date("2026-09-11T12:00:00Z").getTime();

function thread(overrides: Partial<AgentThreadSummary> = {}): AgentThreadSummary {
  return {
    id: "t1",
    path: "/repo",
    title: "Refactor the parser",
    preview: "",
    createdAt: NOW / 1000 - 600,
    updatedAt: NOW / 1000 - 600,
    status: "idle",
    modelProvider: "claude",
    ...overrides,
  };
}

function conversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
  return {
    threadId: "t1",
    path: "/repo",
    title: "Refactor the parser",
    model: "sonnet",
    reasoningEffort: null,
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    turns: [],
    activeTurnId: null,
    loading: false,
    error: null,
    ...overrides,
  };
}

const request: AgentPendingRequest = {
  sessionId: "s1",
  requestId: "r1",
  method: "execCommandApproval",
  kind: "command",
  threadId: "t1",
  raw: {},
};

describe("threadRows", () => {
  it("maps live store state onto sidebar rows", () => {
    const rows = threadRows(
      { "/repo": [thread(), thread({ id: "t2", title: "Pinned work", isPinned: true })] },
      {},
      {},
      { paths: ["/repo"], now: NOW },
    );
    expect(rows.map(row => row.id)).toEqual(["t2", "t1"]);
    expect(rows[1]).toMatchObject({ title: "Refactor the parser", group: "Today", age: "10m", status: "idle" });
    expect(rows[0].group).toBe("Pinned");
  });

  it("hides archived threads and only reads the given paths", () => {
    const rows = threadRows(
      { "/repo": [thread({ archived: true })], "/other": [thread({ id: "t3", path: "/other" })] },
      {},
      {},
      { paths: ["/repo"], now: NOW },
    );
    expect(rows).toEqual([]);
  });
});

describe("threadRowStatus", () => {
  it("prefers pending approvals over a running turn", () => {
    expect(threadRowStatus(thread(), conversation({ activeTurnId: "turn-1" }), [request])).toBe("review");
    expect(threadRowStatus(thread(), conversation({ activeTurnId: "turn-1" }), [])).toBe("running");
  });

  it("reports a failed last turn and a finished conversation", () => {
    const failed: AgentTurn = { id: "turn-1", items: [], status: "failed", error: "boom" };
    expect(threadRowStatus(thread(), conversation({ turns: [failed] }), [])).toBe("failed");
    const done: AgentTurn = { id: "turn-1", items: [], status: "completed" };
    expect(threadRowStatus(thread(), conversation({ turns: [done] }), [])).toBe("done");
    expect(threadRowStatus(thread(), undefined, [])).toBe("idle");
  });
});

describe("transcriptEntries", () => {
  it("renders messages, reasoning, plans and tool calls from real turn items", () => {
    const turns: AgentTurn[] = [
      {
        id: "turn-1",
        status: "inProgress",
        items: [
          { id: "i0", type: "userMessage", content: [{ type: "text", text: "fix the build" }] },
          { id: "i1", type: "reasoning", summary: ["checking"], content: [], redacted: false },
          { id: "i2", type: "plan", plan: [{ step: "read files", status: "completed" }, { step: "patch", status: "inProgress" }] },
          { id: "i3", type: "readTool", path: "src/main.ts", status: "inProgress" },
          { id: "i4", type: "usage", totalTokens: 10 },
          { id: "i5", type: "agentMessage", text: "done" },
        ],
      },
      { id: "turn-2", status: "failed", items: [], error: "process exited" },
    ];
    expect(transcriptEntries(turns)).toEqual([
      { kind: "user", key: "turn-1:i0", text: "fix the build" },
      { kind: "reasoning", key: "turn-1:i1", text: "checking", redacted: false, completed: false },
      {
        kind: "plan",
        key: "turn-1:i2",
        steps: [
          { id: "turn-1:i2:0", label: "read files", status: "completed" },
          { id: "turn-1:i2:1", label: "patch", status: "inProgress" },
        ],
      },
      { kind: "tool", key: "turn-1:i3", label: "Lesen", detail: "src/main.ts", running: true },
      { kind: "agent", key: "turn-1:i5", text: "done" },
      { kind: "error", key: "turn-2:error", text: "process exited" },
    ]);
  });

  it("falls back to the tool name for provider-specific items", () => {
    const entries = transcriptEntries([
      { id: "turn-1", status: "completed", items: [{ id: "i0", type: "dynamicToolCall", name: "render_chart", status: "completed" }] },
    ]);
    expect(entries).toEqual([{ kind: "tool", key: "turn-1:i0", label: "render_chart", detail: "", running: false }]);
  });
});

describe("usage", () => {
  it("keeps only non-empty token segments", () => {
    expect(usageSegments({ totalTokens: 30, modelContextWindow: 100, inputTokens: 20, outputTokens: 10, cacheReadTokens: 0 })).toEqual([
      { label: "Input", tokens: 20 },
      { label: "Output", tokens: 10 },
    ]);
    expect(usageSegments(undefined)).toEqual([]);
  });

  it("formats rate limit windows", () => {
    expect(
      usageLimits(
        {
          limitId: "5h",
          limitName: "5-hour limit",
          primary: { usedPercent: 38.4, windowDurationMins: 300, resetsAt: NOW / 1000 + 9000 },
          secondary: { usedPercent: 3, windowDurationMins: null, resetsAt: null },
          planType: "max",
        },
        NOW,
      ),
    ).toEqual([
      { label: "5-hour limit", resetLabel: "Resets in 2 hr 30 min", percent: 38 },
      { label: "Secondary limit", resetLabel: "", percent: 3 },
    ]);
    expect(usageLimits(null)).toEqual([]);
  });
});

describe("request answers", () => {
  it("uses the decision vocabulary each provider understands", () => {
    expect(approvalResult("codex", true)).toEqual({ decision: "approved" });
    expect(approvalResult("codex", false)).toEqual({ decision: "denied" });
    expect(approvalResult("claude", false)).toEqual({ decision: "decline" });
    expect(approvalResult("opencode", true)).toEqual({ decision: "approve" });
  });

  it("wraps question answers in the indexed shape the stores expect", () => {
    expect(questionAnswerResult(0, ["Inline card"])).toEqual({ answers: { "q-0": { answers: ["Inline card"] } } });
  });
});
