import { useState } from "react";

import { AgentsPage } from "@/routes/agents";
import { claudeChatStore } from "@/lib/agents/providers/claude/chat-store";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import { useWorkspaceStore } from "@/lib/workspace-store";
import type { AgentConversation, AgentPendingRequest, AgentThreadSummary } from "@/lib/agents/types";
import { Toaster } from "@/components/ui/sonner";

const PATH = "/tmp/l8git-agents-fixture";
const NOW = Math.round(Date.now() / 1000);

declare global {
  interface Window {
    __L8GIT_AGENT_CALLS__?: Array<{ name: string; args: unknown[] }>;
  }
}

const thread: AgentThreadSummary = {
  id: "thread-1",
  path: PATH,
  title: "Wire the agents tab",
  preview: "fix the build",
  createdAt: NOW - 900,
  updatedAt: NOW - 900,
  status: "idle",
  modelProvider: "claude",
};

const conversation: AgentConversation = {
  threadId: "thread-1",
  path: PATH,
  title: "Wire the agents tab",
  model: "sonnet",
  reasoningEffort: null,
  approvalPolicy: "on-request",
  sandboxMode: "workspace-write",
  activeTurnId: null,
  loading: false,
  error: null,
  tokenUsage: { totalTokens: 30_000, modelContextWindow: 200_000, inputTokens: 20_000, outputTokens: 10_000 },
  turns: [
    {
      id: "turn-1",
      status: "completed",
      items: [
        { id: "i0", type: "userMessage", content: [{ type: "text", text: "fix the build" }] },
        { id: "i1", type: "reasoning", summary: ["weighing the options"], content: [], redacted: false, __completed: true },
        { id: "i2", type: "readTool", path: "src/main.ts", status: "completed" },
        { id: "i3", type: "agentMessage", text: "Build is green again." },
      ],
    },
  ],
};

const approval: AgentPendingRequest = {
  sessionId: "session-1",
  requestId: "req-1",
  method: "execCommandApproval",
  kind: "command",
  threadId: "thread-1",
  reason: "Run the test suite",
  command: "bun run test",
  raw: {},
};

function seedAgentsScene() {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  window.__L8GIT_AGENT_CALLS__ = calls;
  const record = (name: string) => async (...args: unknown[]) => {
    calls.push({ name, args });
  };
  useWorkspaceStore.setState({ workspaces: [{ id: "default", name: "Fixture", repoPaths: [PATH] }], activeWorkspaceId: "default" });
  useAgentProviderStore.getState().setProvider("claude");
  claudeChatStore.setState({
    connectionStatus: "ready",
    connectionError: null,
    requiresAuth: false,
    account: { type: "oauth", email: "fixture@example.com", planType: "Max" },
    models: [
      {
        id: "sonnet", label: "Sonnet 5", description: "", isDefault: true, inputModalities: ["text"],
        reasoningEfforts: [{ value: "medium", label: "Medium", description: "" }, { value: "high", label: "High", description: "" }],
        defaultReasoningEffort: "medium", serviceTiers: [], defaultServiceTier: null, supportsPersonality: false,
      },
    ],
    threadsByPath: { [PATH]: [thread] },
    conversations: { "thread-1": conversation },
    requestsByThread: { "thread-1": [approval] },
    rateLimits: {
      limitId: "5h", limitName: "5-hour limit", planType: "Max",
      primary: { usedPercent: 38, windowDurationMins: 300, resetsAt: NOW + 9000 },
      secondary: null,
    },
    retainSurface: () => () => {},
    connect: record("connect"),
    loadThreads: record("loadThreads"),
    openThread: record("openThread"),
    sendMessage: record("sendMessage"),
    respondToRequest: record("respondToRequest"),
    setVisibleThread: () => {},
  });
}

export default function AgentsScene() {
  useState(() => { seedAgentsScene(); return true; });
  return (
    <>
      <div className="h-screen">
        <AgentsPage />
      </div>
      <Toaster />
    </>
  );
}
