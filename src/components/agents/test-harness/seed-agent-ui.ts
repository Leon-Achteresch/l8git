import { useInstalledAgents } from "@/lib/agent-integrations";
import { setRepoAgentsTrusted } from "@/lib/agent-trust-prefs";
import { chatStoreFor } from "@/lib/agents/active-chat-store";
import type { CapabilityItem, CapabilityKind, CapabilityScope, CapabilityTargetInfo } from "@/lib/agents/capability-hub";
import { useCapabilityHubStore } from "@/lib/agents/capability-hub";
import { useAgentCapabilityStore } from "@/lib/agents/capability-store";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import { useWorkspaceStore } from "@/lib/workspace-store";
import type {
  AgentConversation,
  AgentModelOption,
  AgentThreadSummary,
  AgentTurn,
} from "@/lib/agents/types";
import { useRepoStore } from "@/lib/repo-store";

export const AGENT_UI_PATH = "/tmp/l8git";
export const AGENT_UI_OTHER_PATH = "/tmp/vault";
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

function hubTarget(
  cli: string,
  label: string,
  kinds: CapabilityKind[],
  userCount: number,
): CapabilityTargetInfo {
  return {
    cli,
    label,
    command: cli,
    installed: true,
    kinds,
    scopes: [
      { scope: "global", root: null, exists: false, writable: false, itemCount: 0 },
      { scope: "user", root: `/tmp/.${cli}`, exists: true, writable: true, itemCount: userCount },
      { scope: "repo", root: `${AGENT_UI_PATH}/.${cli}`, exists: true, writable: true, itemCount: 0 },
    ],
  };
}

function hubItem(
  cli: string,
  kind: CapabilityKind,
  name: string,
  fingerprint: string,
  description: string,
): CapabilityItem {
  const scope: CapabilityScope = "user";
  return {
    id: `${cli}:${scope}:${kind}:${name}`,
    cli,
    scope,
    kind,
    name,
    rel: name,
    description,
    path: `/tmp/.${cli}/${kind}s/${name}`,
    isDirectory: kind === "skill",
    fileCount: kind === "skill" ? 2 : 1,
    sizeBytes: 120,
    updatedAtMs: 0,
    fingerprint,
  };
}

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

function threadSummary(
  id: string,
  title: string,
  updatedAt: number,
  status = "idle",
  path = AGENT_UI_PATH,
  additions?: number,
  deletions?: number,
): AgentThreadSummary {
  return {
    id,
    path,
    title,
    preview: title,
    createdAt: updatedAt - 3600,
    updatedAt,
    status,
    modelProvider: "openai",
    additions,
    deletions,
  };
}

function editTurn(id: string, additions: number, deletions: number): AgentTurn {
  return turn(id, [
    {
      id: `${id}-edit`,
      type: "fileChange",
      linesAdded: additions,
      linesRemoved: deletions,
      changes: [{ path: "file.ts", additions, deletions }],
    },
  ]);
}

function modelConversation(
  id: string,
  title: string,
  model: string,
  additions?: number,
  deletions?: number,
): AgentConversation {
  return {
    threadId: id,
    path: AGENT_UI_PATH,
    title,
    model,
    reasoningEffort: null,
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    turns:
      additions || deletions
        ? [editTurn("edit", additions ?? 0, deletions ?? 0)]
        : [],
    activeTurnId: null,
    loading: false,
    error: null,
  };
}

export function agentUiThreadId(scene: string): string | null {
  if (scene === "chat" || scene === "busy") return AGENT_UI_THREAD;
  if (scene === "sidebar") return "thread-cursor";
  return null;
}

function seedProfileScene(): void {
  useWorkspaceStore.getState().addRepoToActiveWorkspace(AGENT_UI_PATH);
  document.documentElement.classList.add("dark");
  const now = Math.floor(Date.now() / 1000);
  const day = 86_400;
  useAgentProviderStore.setState({ provider: "codex" });
  useRepoStore.setState((state) => ({
    repos: {
      ...state.repos,
      [AGENT_UI_PATH]: {
        path: AGENT_UI_PATH,
        branch: "main",
        commits: [],
        branches: [],
        tags: [],
      },
    },
  }));

  // Deterministic pseudo-random: stable screenshots across runs.
  const rand = (seed: number) => {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const titles = [
    "Refactor token ledger",
    "Fix heatmap overflow",
    "Wire profile stats",
    "Polish composer dock",
    "Review capability hub",
    "Migrate sidebar tabs",
    "Tune motion springs",
    "Audit worktree diffs",
  ];

  const threads: AgentThreadSummary[] = [];
  const conversations: Record<string, AgentConversation> = {};
  let seed = 1;
  // ~2 threads/day for the last 40 days + a tail of older threads for streaks.
  for (let ago = 0; ago < 40; ago += 1) {
    const perDay = ago % 5 === 3 ? 0 : 2; // idle days collapse to grey stubs
    for (let k = 0; k < perDay; k += 1) {
      seed += 1;
      const id = `profile-thread-${ago}-${k}`;
      const updatedAt = now - ago * day - Math.floor(rand(seed) * 3600 * 8);
      const running = ago === 0 && k === 0;
      threads.push({
        id,
        path: AGENT_UI_PATH,
        title: `${titles[Math.floor(rand(seed + 99) * titles.length)]} #${ago * 2 + k}`,
        preview: "profile fixture",
        createdAt: updatedAt - 1800,
        updatedAt,
        status: running ? "working" : "idle",
        modelProvider: "openai",
      });
      const input = Math.floor(20_000 + rand(seed + 1) * 180_000);
      const output = Math.floor(5_000 + rand(seed + 2) * 60_000);
      conversations[id] = {
        threadId: id,
        path: AGENT_UI_PATH,
        title: id,
        model: MODEL.id,
        reasoningEffort: "medium",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        turns: [],
        activeTurnId: running ? "turn-active" : null,
        loading: false,
        error: null,
        tokenUsage: {
          totalTokens: input + output,
          modelContextWindow: 200_000,
          inputTokens: input,
          outputTokens: output,
        },
      };
    }
  }
  // Older tail (60–120 days ago) for the yearly heatmap + streak math.
  for (let ago = 60; ago < 120; ago += 3) {
    seed += 1;
    const id = `profile-old-${ago}`;
    const updatedAt = now - ago * day;
    threads.push({
      id,
      path: AGENT_UI_PATH,
      title: `Backfill context ${ago}d ago`,
      preview: "profile fixture",
      createdAt: updatedAt - 900,
      updatedAt,
      status: "idle",
      modelProvider: "openai",
    });
    conversations[id] = {
      threadId: id,
      path: AGENT_UI_PATH,
      title: id,
      model: MODEL.id,
      reasoningEffort: null,
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      turns: [],
      activeTurnId: null,
      loading: false,
      error: null,
      tokenUsage: {
        totalTokens: 40_000,
        modelContextWindow: 200_000,
        inputTokens: 30_000,
        outputTokens: 10_000,
      },
    };
  }

  chatStoreFor("codex").setState({
    connectionStatus: "ready",
    models: [MODEL],
    model: MODEL.id,
    conversations,
    activeThreadByPath: { [AGENT_UI_PATH]: "profile-thread-0-0" },
    threadsByPath: { [AGENT_UI_PATH]: threads },
    loadingPaths: {},
    sendMessage: noop,
    openThread: noop,
    connect: noop,
    createThread: async () => "profile-thread-0-0",
  });
}

export function seedAgentUi(scene: string): void {
  useAgentProviderStore.setState({ provider: "codex" });
  useInstalledAgents.setState({
    installed: new Set(["codex", "claude", "cursor", "opencode"]),
  });
  setRepoAgentsTrusted(AGENT_UI_PATH, true);

  if (scene === "profile" || scene.startsWith("fleet") || scene === "workspace") {
    seedProfileScene();
    if (scene.startsWith("fleet") || scene === "workspace") {
      const current = chatStoreFor("codex").getState();
      const failed = current.conversations["profile-old-60"];
      chatStoreFor("codex").setState({
        requestsByThread: {
          "profile-thread-1-0": [{ requestId: 1, method: "approval" } as never],
        },
        conversations: failed
          ? { ...current.conversations, "profile-old-60": { ...failed, error: "Tool call failed" } }
          : current.conversations,
      });
    }
    if (scene === "fleet-empty" || scene === "fleet-loading") {
      chatStoreFor("codex").setState({
        threadsByPath: {}, conversations: {}, requestsByThread: {},
        loadingPaths: scene === "fleet-loading" ? { [AGENT_UI_PATH]: true } : {},
      });
    }
    if (scene === "workspace") {
      for (const id of ["codex", "claude", "cursor", "opencode"] as const) {
        const store = chatStoreFor(id);
        store.setState({
          loadThreads: noop,
          connect: noop,
          retainSurface: () => () => undefined,
          openThread: async (path, threadId) => {
            store.setState((state) => ({ activeThreadByPath: { ...state.activeThreadByPath, [path]: threadId } }));
          },
        });
      }
    }
    return;
  }

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

  if (scene === "capabilities") {
    document.documentElement.classList.add("dark");
    useAgentCapabilityStore.setState({
      path: AGENT_UI_PATH,
      loading: false,
      loadedAt: Date.now(),
      skills: [
        {
          name: "review",
          description: "Review pull requests against the repo conventions.",
          path: `${AGENT_UI_PATH}/.agents/skills/review`,
          scope: "repo",
          enabled: true,
        },
        {
          name: "commit",
          description: "Draft precise commit messages from the staged diff.",
          path: `${AGENT_UI_PATH}/.agents/skills/commit`,
          scope: "user",
          enabled: true,
        },
        {
          name: "debug",
          description: "Hunt regressions from failing tests and logs.",
          path: `${AGENT_UI_PATH}/.agents/skills/debug`,
          scope: "repo",
          enabled: false,
        },
      ],
      mcpServers: [],
      apps: [],
      hooks: { hooks: [], warnings: [], errors: [] },
      marketplaces: [],
      load: async () => undefined,
      refresh: async () => undefined,
    });
    useCapabilityHubStore.setState({
      path: AGENT_UI_PATH,
      loading: false,
      busy: false,
      loadedAt: Date.now(),
      error: null,
      inventory: {
        targets: [
          hubTarget("codex", "Codex", ["skill", "command", "agent", "mcp", "hook"], 3),
          hubTarget("claude", "Claude Code", ["skill", "command", "agent", "mcp", "hook"], 2),
          hubTarget("cursor", "Cursor CLI", ["skill", "command", "agent", "mcp"], 0),
        ],
        items: [
          hubItem("codex", "skill", "review", "rev-a", "Review pull requests against the repo conventions."),
          hubItem("codex", "skill", "commit", "cmt-a", "Draft precise commit messages from the staged diff."),
          hubItem("codex", "skill", "debug", "dbg-a", "Hunt regressions from failing tests and logs."),
          hubItem("claude", "skill", "review", "rev-a", "Review pull requests against the repo conventions."),
          hubItem("claude", "command", "ship", "shp-a", "Open a PR from the current branch."),
        ],
        warnings: [],
      },
      load: async () => undefined,
    });
    return;
  }

  if (scene === "sidebar") {
    document.documentElement.classList.add("dark");
    const now = Math.floor(Date.now() / 1000);
    useAgentProviderStore.setState({ provider: "cursor" });
    useRepoStore.setState((state) => ({
      repos: {
        ...state.repos,
        [AGENT_UI_PATH]: {
          path: AGENT_UI_PATH,
          branch: "main",
          commits: [],
          branches: [],
          tags: [],
        },
        [AGENT_UI_OTHER_PATH]: {
          path: AGENT_UI_OTHER_PATH,
          branch: "feat/scanner",
          commits: [],
          branches: [],
          tags: [],
        },
      },
    }));
    chatStoreFor("codex").setState({
      connectionStatus: "ready",
      models: [MODEL],
      conversations: {
        "thread-readme": modelConversation(
          "thread-readme",
          "Replace public README...",
          MODEL.id,
          340,
          133,
        ),
      },
      threadsByPath: {
        [AGENT_UI_PATH]: [
          threadSummary(
            "thread-readme",
            "Replace public README...",
            now - 180,
            "idle",
            AGENT_UI_PATH,
            340,
            133,
          ),
        ],
      },
      loadingPaths: {},
    });
    chatStoreFor("claude").setState({
      models: [{ ...MODEL, id: "claude-opus-4", label: "Claude Opus 4" }],
      conversations: {
        "thread-arcade": modelConversation(
          "thread-arcade",
          "Benchmark arcade games",
          "claude-opus-4",
          12,
          3,
        ),
      },
      threadsByPath: {
        [AGENT_UI_PATH]: [
          threadSummary(
            "thread-arcade",
            "Benchmark arcade games",
            now - 22 * 60,
            "idle",
            AGENT_UI_PATH,
            12,
            3,
          ),
        ],
        [AGENT_UI_OTHER_PATH]: [
          threadSummary(
            "thread-vault",
            "Wire vault scanner",
            now - 8 * 3600,
            "idle",
            AGENT_UI_OTHER_PATH,
            88,
            21,
          ),
        ],
      },
      loadingPaths: {},
    });
    chatStoreFor("cursor").setState({
      connectionStatus: "ready",
      models: [{ ...MODEL, id: "grok-4.6", label: "Cursor Grok 4.6" }],
      conversations: {
        "thread-cursor": {
          ...conversation([...turns, editTurn("cursor-edit", 471, 8)]),
          threadId: "thread-cursor",
          title: "Empty chat dots spell the wait",
          model: "grok-4.6",
        },
      },
      threadsByPath: {
        [AGENT_UI_PATH]: [
          threadSummary(
            "thread-cursor",
            "Empty chat dots spell the wait",
            now - 7 * 3600 - 59 * 60,
            "idle",
            AGENT_UI_PATH,
            471,
            8,
          ),
        ],
      },
      activeThreadByPath: { [AGENT_UI_PATH]: "thread-cursor" },
      loadingPaths: {},
      sendMessage: noop,
      openThread: noop,
      connect: noop,
      createThread: async () => "thread-cursor",
    });
    return;
  }

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
