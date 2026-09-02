import { useInstalledAgents } from "@/lib/agent-integrations";
import { setRepoAgentsTrusted } from "@/lib/agent-trust-prefs";
import { chatStoreFor } from "@/lib/agents/active-chat-store";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import type {
  AgentConversation,
  AgentModelOption,
  AgentTurn,
} from "@/lib/agents/types";

export const AGENT_UI_PATH = "/tmp/l8git";
export const AGENT_UI_THREAD = "thread-ui";

const MODEL: AgentModelOption = {
  id: "gpt-5",
  label: "GPT-5",
  description: "Test model",
  isDefault: true,
  inputModalities: ["text"],
  reasoningEfforts: [
    { value: "low", label: "low", description: "" },
    { value: "medium", label: "medium", description: "" },
    { value: "high", label: "high", description: "" },
    { value: "xhigh", label: "xhigh", description: "" },
  ],
  defaultReasoningEffort: "medium",
  serviceTiers: [],
  defaultServiceTier: null,
  supportsPersonality: false,
};

const noop = async () => undefined;

function turn(
  id: string,
  items: AgentTurn["items"],
  status: AgentTurn["status"] = "completed",
): AgentTurn {
  return { id, items, status, error: null, durationMs: 1200 };
}

function conversation(turns: AgentTurn[]): AgentConversation {
  return {
    threadId: AGENT_UI_THREAD,
    path: AGENT_UI_PATH,
    title: "Layout fixture",
    model: MODEL.id,
    reasoningEffort: "medium",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    turns,
    activeTurnId: turns.find((entry) => entry.status === "inProgress")?.id ?? null,
    loading: false,
    error: null,
    tokenUsage: {
      totalTokens: 88_000,
      modelContextWindow: 200_000,
      inputTokens: 60_000,
      outputTokens: 28_000,
    },
  };
}

function transcriptTurns(): AgentTurn[] {
  const turns: AgentTurn[] = [];
  for (let index = 0; index < 6; index += 1) {
    turns.push(
      turn(`user-${index}`, [
        {
          id: `user-${index}-msg`,
          type: "userMessage",
          content: [{ type: "text", text: `Prompt ${index + 1}` }],
        },
      ]),
    );
    turns.push(
      turn(`agent-${index}`, [
        {
          id: `agent-${index}-msg`,
          type: "agentMessage",
          text:
            index === 4
              ? "Lange Antwort mit `code`, einem Pfad `/very/long/path/to/a/file.ts` und genug Text, damit die Bubble umbricht ohne das Layout zu sprengen.".repeat(4)
              : `Antwort ${index + 1}`,
        },
      ]),
    );
  }
  turns.push(
    turn("compact-last", [
      { id: "compact-1", type: "contextCompaction" },
    ]),
  );
  return turns;
}

export function agentUiThreadId(scene: string): string | null {
  if (scene === "chat" || scene === "busy") return AGENT_UI_THREAD;
  return null;
}

export function seedAgentUi(scene: string): void {
  useAgentProviderStore.setState({ provider: "codex" });
  useInstalledAgents.setState({
    installed: new Set(["codex", "claude", "cursor", "opencode"]),
  });
  setRepoAgentsTrusted(AGENT_UI_PATH, true);

  const turns =
    scene === "busy"
      ? [
          ...transcriptTurns().slice(0, 2),
          turn(
            "active",
            [{ id: "active-msg", type: "agentMessage", text: "Arbeitet…" }],
            "inProgress",
          ),
        ]
      : transcriptTurns();

  const connectionStatus =
    scene === "connecting"
      ? "connecting"
      : scene === "error"
        ? "error"
        : "ready";

  chatStoreFor("codex").setState({
    connectionStatus,
    connectionError: scene === "error" ? "CLI nicht erreichbar" : null,
    requiresAuth: scene === "auth",
    loginStatus: "idle",
    loginError: null,
    models: [MODEL],
    model: MODEL.id,
    defaultModel: MODEL.id,
    reasoningEffort: "medium",
    conversations:
      scene === "chat" || scene === "busy"
        ? { [AGENT_UI_THREAD]: conversation(turns) }
        : {},
    activeThreadByPath:
      scene === "chat" || scene === "busy"
        ? { [AGENT_UI_PATH]: AGENT_UI_THREAD }
        : {},
    sessionStatusByThread:
      scene === "busy" ? { [AGENT_UI_THREAD]: "connecting" } : {},
    requestsByThread: {},
    permissionProfiles: [],
    sendMessage: noop,
    steerMessage: noop,
    interrupt: noop,
    createThread: async () => AGENT_UI_THREAD,
    openThread: noop,
    connect: noop,
    loadPermissionProfiles: noop,
    compactThread: noop,
  });
}
