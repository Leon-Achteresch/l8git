import {
  JsonRpcProcessClient,
  type RpcId,
  type RpcNotification,
  type RpcServerRequest,
} from "@/lib/agents/rpc-client";
import { CODEX_BARCODE_TOOL } from "@/lib/agents/barcode-spec";
import type {
  AgentCapabilityApp,
  AgentCapabilityConfig,
  AgentCapabilityHookEntry,
  AgentCapabilityMarketplace,
  AgentCapabilityMcpServer,
  AgentCapabilityPlugin,
  AgentCapabilitySkill,
  AgentConfigEdit,
  AgentConfigMergeStrategy,
  AgentMarketplaceLoadError,
  AgentPluginDetail,
} from "@/lib/agents/capability-types";
import type {
  AgentApprovalPolicy,
  AgentAccountUsage,
  AgentApp,
  AgentBackgroundTerminal,
  AgentExternalConfigImportHistory,
  AgentExternalConfigImportTypeResult,
  AgentExternalConfigMigrationItem,
  AgentGoal,
  AgentPermissionProfile,
  AgentRealtimeVoices,
  AgentReasoningEffort,
  AgentSandboxMode,
  AgentSkill,
} from "@/lib/agents/types";
import {
  codexSandboxPolicy,
  type CodexAccountResponse,
  type CodexLoginResponse,
  type CodexModel,
  type CodexModelListResponse,
  type CodexRateLimitsResponse,
  type CodexRealtimeAudioChunk,
  type CodexRealtimeStartOptions,
  type CodexThread,
  type CodexThreadRuntime,
  type CodexThreadStartOptions,
  type CodexTurnOptions,
  type CodexUserInput,
} from "@/lib/agents/providers/codex/protocol";

type EventListener = (event: RpcNotification) => void;
type RequestListener = (request: RpcServerRequest) => void;
type StatusListener = (event: { type: "stderr" | "exit"; value: string | number }) => void;

export interface CodexExternalAgentConfigImportCompleted {
  importId: string;
  itemTypeResults: AgentExternalConfigImportTypeResult[];
}

export class CodexAgentClient {
  private readonly rpc: JsonRpcProcessClient;
  private initialized = false;
  private connectPromise: Promise<void> | null = null;

  constructor(readonly sessionId: string) {
    this.rpc = new JsonRpcProcessClient(sessionId);
    this.rpc.onStatus((event) => {
      if (event.type === "exit") this.initialized = false;
    });
  }

  onEvent(listener: EventListener): () => void {
    return this.rpc.onNotification(listener);
  }

  onRequest(listener: RequestListener): () => void {
    return this.rpc.onServerRequest(listener);
  }

  onStatus(listener: StatusListener): () => void {
    return this.rpc.onStatus(listener);
  }

  async connect(): Promise<void> {
    if (this.initialized) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = (async () => {
      try {
        await this.rpc.connect("codex");
        await this.rpc.request("initialize", {
          clientInfo: {
            name: "l8git",
            title: "l8git",
            version: "0.4.0",
          },
          capabilities: {
            experimentalApi: true,
          },
        });
        await this.rpc.notify("initialized", {});
        this.initialized = true;
      } catch (error) {
        await this.rpc.close().catch(() => {});
        throw error;
      } finally {
        this.connectPromise = null;
      }
    })();
    return this.connectPromise;
  }

  account(): Promise<CodexAccountResponse> {
    return this.rpc.request("account/read", { refreshToken: false });
  }

  loginChatGpt(): Promise<CodexLoginResponse> {
    return this.rpc.request("account/login/start", {
      type: "chatgpt",
      codexStreamlinedLogin: true,
      useHostedLoginSuccessPage: true,
    });
  }

  logout(): Promise<Record<string, never>> {
    return this.rpc.request("account/logout", undefined);
  }

  rateLimits(): Promise<CodexRateLimitsResponse> {
    return this.rpc.request("account/rateLimits/read", undefined);
  }

  usage(): Promise<{ summary: AgentAccountUsage }> {
    return this.rpc.request("account/usage/read", undefined);
  }

  async models(): Promise<CodexModel[]> {
    const all: CodexModel[] = [];
    let cursor: string | null = null;
    do {
      const page: CodexModelListResponse = await this.rpc.request("model/list", {
        includeHidden: false,
        ...(cursor ? { cursor } : {}),
      });
      all.push(...(page.data ?? []));
      cursor = page.nextCursor ?? null;
    } while (cursor && all.length < 500);
    return all;
  }

  skills(cwd: string, forceReload = false): Promise<{ data: Array<{ cwd: string; skills: AgentSkill[] }> }> {
    return this.rpc.request("skills/list", { cwds: [cwd], forceReload });
  }

  capabilitySkills(cwd: string, forceReload = false): Promise<{
    data: Array<{
      cwd: string;
      skills: AgentCapabilitySkill[];
      errors: Array<{ path: string; message: string }>;
    }>;
  }> {
    return this.rpc.request("skills/list", { cwds: [cwd], forceReload });
  }

  setSkillEnabled(path: string, enabled: boolean): Promise<{ effectiveEnabled: boolean }> {
    return this.rpc.request("skills/config/write", { path, enabled });
  }

  apps(threadId?: string, cursor?: string): Promise<{ data: AgentApp[]; nextCursor: string | null }> {
    return this.rpc.request("app/list", {
      limit: 100,
      cursor: cursor ?? null,
      threadId: threadId ?? null,
      forceRefetch: false,
    });
  }

  capabilityApps(
    threadId?: string,
    cursor?: string,
    forceRefetch = false,
  ): Promise<{ data: AgentCapabilityApp[]; nextCursor: string | null }> {
    return this.rpc.request("app/list", {
      limit: 100,
      cursor: cursor ?? null,
      threadId: threadId ?? null,
      forceRefetch,
    });
  }

  installedApps(threadId?: string, forceRefresh = false): Promise<{
    apps: Array<{
      id: string;
      runtimeName: string | null;
      enabled: boolean;
      callable: boolean;
    }>;
  }> {
    return this.rpc.request("app/installed", {
      threadId: threadId ?? null,
      forceRefresh,
    });
  }

  readApps(appIds: string[]): Promise<{
    apps: Array<{
      id: string;
      name: string;
      description: string | null;
      iconUrl: string | null;
      iconUrlDark: string | null;
      distributionChannel: string | null;
      installUrl: string | null;
      pluginDisplayNames: string[];
      toolSummaries: AgentCapabilityApp["tools"] | null;
    }>;
    missingAppIds: string[];
  }> {
    return this.rpc.request("app/read", { appIds, includeTools: true });
  }

  collaborationModes(): Promise<{
    data: Array<{
      name: string;
      mode: "default" | "plan" | null;
      model: string | null;
      reasoning_effort: AgentReasoningEffort | null;
    }>;
  }> {
    return this.rpc.request("collaborationMode/list", {});
  }

  permissionProfiles(cwd: string, cursor?: string): Promise<{
    data: AgentPermissionProfile[];
    nextCursor: string | null;
  }> {
    return this.rpc.request("permissionProfile/list", {
      cwd,
      cursor: cursor ?? null,
      limit: 100,
    });
  }

  realtimeVoices(): Promise<{ voices: AgentRealtimeVoices }> {
    return this.rpc.request("thread/realtime/listVoices", {});
  }

  mcpServers(threadId?: string, cursor?: string): Promise<{
    data: Array<{
      name: string;
      tools: Record<string, unknown>;
      authStatus: string | { type?: string };
    }>;
    nextCursor: string | null;
  }> {
    return this.rpc.request("mcpServerStatus/list", {
      cursor: cursor ?? null,
      limit: 100,
      detail: "full",
      threadId: threadId ?? null,
    });
  }

  capabilityMcpServers(threadId?: string, cursor?: string): Promise<{
    data: AgentCapabilityMcpServer[];
    nextCursor: string | null;
  }> {
    return this.rpc.request("mcpServerStatus/list", {
      cursor: cursor ?? null,
      limit: 100,
      detail: "full",
      threadId: threadId ?? null,
    });
  }

  reloadMcpServers(): Promise<Record<string, never>> {
    return this.rpc.request("config/mcpServer/reload", undefined);
  }

  loginMcpServer(name: string, threadId?: string): Promise<{ authorizationUrl: string }> {
    return this.rpc.request("mcpServer/oauth/login", {
      name,
      threadId: threadId ?? null,
      scopes: null,
      timeoutSecs: null,
    });
  }

  fuzzyFiles(query: string, roots: string[]): Promise<{
    files: Array<{
      root: string;
      path: string;
      file_name: string;
      score: number;
    }>;
  }> {
    return this.rpc.request("fuzzyFileSearch", {
      query,
      roots,
      cancellationToken: null,
    });
  }

  hooks(cwd: string): Promise<{
    data: Array<{
      cwd: string;
      hooks: Array<{
        key: string;
        eventName: string;
        enabled: boolean;
        trustStatus: string;
      }>;
    }>;
  }> {
    return this.rpc.request("hooks/list", { cwds: [cwd] });
  }

  capabilityHooks(cwd: string): Promise<{
    data: Array<{ cwd: string } & AgentCapabilityHookEntry>;
  }> {
    return this.rpc.request("hooks/list", { cwds: [cwd] });
  }

  plugins(cwd: string): Promise<{
    marketplaces: Array<{
      plugins: Array<{
        id: string;
        name: string;
        installed: boolean;
        enabled: boolean;
        availability: string;
      }>;
    }>;
  }> {
    return this.rpc.request("plugin/list", {
      cwds: [cwd],
      forceRefetch: false,
    });
  }

  capabilityPlugins(cwd: string, forceRefetch = false): Promise<{
    marketplaces: AgentCapabilityMarketplace[];
    marketplaceLoadErrors: AgentMarketplaceLoadError[];
    featuredPluginIds: string[];
  }> {
    return this.rpc.request("plugin/list", {
      cwds: [cwd],
      forceRefetch,
    });
  }

  readPlugin(plugin: AgentCapabilityPlugin): Promise<{ plugin: AgentPluginDetail }> {
    return this.rpc.request("plugin/read", {
      marketplacePath: plugin.marketplacePath,
      remoteMarketplaceName: plugin.marketplacePath ? null : plugin.marketplaceName,
      pluginName: plugin.name,
    });
  }

  installPlugin(plugin: AgentCapabilityPlugin): Promise<{
    authPolicy: string;
    appsNeedingAuth: Array<{
      id: string;
      name: string;
      description: string | null;
      installUrl: string | null;
    }>;
  }> {
    return this.rpc.request("plugin/install", {
      marketplacePath: plugin.marketplacePath,
      remoteMarketplaceName: plugin.marketplacePath ? null : plugin.marketplaceName,
      pluginName: plugin.name,
    });
  }

  uninstallPlugin(pluginId: string): Promise<Record<string, never>> {
    return this.rpc.request("plugin/uninstall", { pluginId });
  }

  addMarketplace(
    source: string,
    refName?: string,
    sparsePaths?: string[],
  ): Promise<Record<string, unknown>> {
    return this.rpc.request("marketplace/add", {
      source,
      refName: refName || null,
      sparsePaths: sparsePaths?.length ? sparsePaths : null,
    });
  }

  removeMarketplace(marketplaceName: string): Promise<Record<string, unknown>> {
    return this.rpc.request("marketplace/remove", { marketplaceName });
  }

  upgradeMarketplace(marketplaceName?: string): Promise<Record<string, unknown>> {
    return this.rpc.request("marketplace/upgrade", {
      marketplaceName: marketplaceName || null,
    });
  }

  readConfig(cwd: string): Promise<Omit<AgentCapabilityConfig, "userConfigPath" | "projectConfigPath">> {
    return this.rpc.request("config/read", { includeLayers: true, cwd });
  }

  writeConfigValue(
    keyPath: string,
    value: unknown,
    mergeStrategy: AgentConfigMergeStrategy = "upsert",
    filePath?: string,
  ): Promise<{
    status: string;
    version: string;
    filePath: string;
    overriddenMetadata: Record<string, unknown> | null;
  }> {
    return this.rpc.request("config/value/write", {
      keyPath,
      value,
      mergeStrategy,
      filePath: filePath ?? null,
      expectedVersion: null,
    });
  }

  writeConfigBatch(
    edits: AgentConfigEdit[],
    filePath?: string,
    reloadUserConfig = true,
  ): Promise<{
    status: string;
    version: string;
    filePath: string;
    overriddenMetadata: Record<string, unknown> | null;
  }> {
    return this.rpc.request("config/batchWrite", {
      edits,
      filePath: filePath ?? null,
      expectedVersion: null,
      reloadUserConfig,
    });
  }

  readHostFile(path: string): Promise<{ dataBase64: string }> {
    return this.rpc.request("fs/readFile", { path });
  }

  writeHostFile(path: string, dataBase64: string): Promise<Record<string, never>> {
    return this.rpc.request("fs/writeFile", { path, dataBase64 });
  }

  createHostDirectory(path: string): Promise<Record<string, never>> {
    return this.rpc.request("fs/createDirectory", { path, recursive: true });
  }

  removeHostPath(path: string): Promise<Record<string, never>> {
    return this.rpc.request("fs/remove", { path, recursive: true, force: false });
  }

  copyHostPath(sourcePath: string, destinationPath: string): Promise<Record<string, never>> {
    return this.rpc.request("fs/copy", { sourcePath, destinationPath, recursive: true });
  }

  detectExternalAgentConfig(cwds: string[]): Promise<{
    items: AgentExternalConfigMigrationItem[];
  }> {
    return this.rpc.request("externalAgentConfig/detect", {
      includeHome: true,
      cwds,
      maxSessionAgeDays: 30,
      maxSessions: 50,
      migrationSource: "claude-code",
    });
  }

  importExternalAgentConfig(migrationItems: AgentExternalConfigMigrationItem[]): Promise<{
    importId: string;
  }> {
    return this.rpc.request("externalAgentConfig/import", {
      migrationItems,
      source: "l8git",
      providerId: "claude-code",
      migrationSource: "claude-code",
    });
  }

  externalAgentConfigImportHistories(): Promise<{
    data: AgentExternalConfigImportHistory[];
    connectors: Array<{
      name: string;
      sessionCount: number;
      source: "remoteMcpServersConfig";
    }>;
  }> {
    return this.rpc.request("externalAgentConfig/import/readHistories", undefined);
  }

  feedback(params: {
    classification: string;
    reason: string;
    threadId?: string;
    includeLogs: boolean;
  }): Promise<{ threadId: string }> {
    return this.rpc.request("feedback/upload", {
      classification: params.classification,
      reason: params.reason || null,
      threadId: params.threadId ?? null,
      includeLogs: params.includeLogs,
      extraLogFiles: null,
      tags: { client: "l8git" },
    });
  }

  startThread(options: CodexThreadStartOptions): Promise<CodexThreadRuntime> {
    return this.rpc.request("thread/start", {
      cwd: options.cwd,
      model: options.model ?? null,
      serviceTier: options.serviceTier ?? null,
      approvalPolicy: options.approvalPolicy ?? "on-request",
      sandbox: options.permissions ? undefined : (options.sandbox ?? "workspace-write"),
      permissions: options.permissions ?? undefined,
      personality: options.personality ?? null,
      ephemeral: false,
      serviceName: "l8git",
      threadSource: "appServer",
      // Host-owned renderers are persisted in Codex's thread metadata, so a
      // later thread/resume restores them without touching the user's config.
      dynamicTools: [CODEX_BARCODE_TOOL],
    });
  }

  resumeThread(threadId: string): Promise<CodexThreadRuntime> {
    return this.rpc.request("thread/resume", { threadId });
  }

  listThreads(
    cwd: string,
    cursor: string | null = null,
  ): Promise<{ data: CodexThread[]; nextCursor: string | null }> {
    return this.rpc.request("thread/list", {
      cursor,
      limit: 100,
      sortKey: "updated_at",
      sortDirection: "desc",
      cwd,
      archived: false,
      // The local catalog may contain an explicitly adopted CLI/IDE thread,
      // while sessions created by l8git use appServer. Query every source but
      // only retain IDs that l8git already tracks.
      sourceKinds: [
        "cli",
        "vscode",
        "exec",
        "appServer",
        "subAgent",
        "subAgentReview",
        "subAgentCompact",
        "subAgentThreadSpawn",
        "subAgentOther",
        "unknown",
      ],
    });
  }

  forkThread(threadId: string, options: CodexThreadStartOptions): Promise<CodexThreadRuntime> {
    return this.rpc.request("thread/fork", {
      threadId,
      cwd: options.cwd,
      model: options.model ?? null,
      serviceTier: options.serviceTier ?? null,
      approvalPolicy: options.approvalPolicy ?? "on-request",
      sandbox: options.permissions ? undefined : (options.sandbox ?? "workspace-write"),
      permissions: options.permissions ?? undefined,
      personality: options.personality ?? null,
      ephemeral: false,
      threadSource: "appServer",
    });
  }

  compactThread(threadId: string): Promise<Record<string, never>> {
    return this.rpc.request("thread/compact/start", { threadId });
  }

  readThread(threadId: string): Promise<{ thread: CodexThreadRuntime["thread"] }> {
    return this.rpc.request("thread/read", { threadId, includeTurns: true });
  }

  startTurn(
    threadId: string,
    input: CodexUserInput[],
    clientUserMessageId: string,
    options: CodexTurnOptions,
  ): Promise<{ turn: { id: string } }> {
    return this.rpc.request("turn/start", {
      threadId,
      clientUserMessageId,
      input,
      model: options.model ?? null,
      effort: options.effort ?? null,
      approvalPolicy: options.approvalPolicy ?? null,
      sandboxPolicy: options.sandboxPolicy ?? null,
      permissions: options.permissions ?? null,
      serviceTier: options.serviceTier ?? null,
      personality: options.personality ?? null,
      collaborationMode: options.collaborationMode ?? null,
    });
  }

  interrupt(threadId: string, turnId: string): Promise<Record<string, never>> {
    return this.rpc.request("turn/interrupt", { threadId, turnId });
  }

  startRealtime(
    threadId: string,
    options: CodexRealtimeStartOptions = {},
  ): Promise<Record<string, never>> {
    return this.rpc.request("thread/realtime/start", {
      threadId,
      outputModality: options.outputModality ?? "audio",
      voice: options.voice ?? null,
      flushTranscriptTailOnSessionEnd: true,
      includeStartupContext: true,
    });
  }

  appendRealtimeAudio(
    threadId: string,
    audio: CodexRealtimeAudioChunk,
  ): Promise<Record<string, never>> {
    return this.rpc.request("thread/realtime/appendAudio", { threadId, audio });
  }

  appendRealtimeText(
    threadId: string,
    text: string,
    role: "user" | "developer" | "assistant" = "user",
  ): Promise<Record<string, never>> {
    return this.rpc.request("thread/realtime/appendText", { threadId, text, role });
  }

  stopRealtime(threadId: string): Promise<Record<string, never>> {
    return this.rpc.request("thread/realtime/stop", { threadId });
  }

  archiveThread(threadId: string): Promise<Record<string, never>> {
    return this.rpc.request("thread/archive", { threadId });
  }

  unarchiveThread(threadId: string): Promise<Record<string, never>> {
    return this.rpc.request("thread/unarchive", { threadId });
  }

  deleteThread(threadId: string): Promise<Record<string, never>> {
    return this.rpc.request("thread/delete", { threadId });
  }

  renameThread(threadId: string, name: string): Promise<Record<string, never>> {
    return this.rpc.request("thread/name/set", { threadId, name });
  }

  setThreadPinned(threadId: string, isPinned: boolean): Promise<{ thread: CodexThreadRuntime["thread"] }> {
    return this.rpc.request("thread/metadata/update", { threadId, isPinned });
  }

  backgroundTerminals(threadId: string): Promise<{ data: AgentBackgroundTerminal[]; nextCursor: string | null }> {
    return this.rpc.request("thread/backgroundTerminals/list", { threadId, limit: 100 });
  }

  cleanBackgroundTerminals(threadId: string): Promise<Record<string, never>> {
    return this.rpc.request("thread/backgroundTerminals/clean", { threadId });
  }

  terminateBackgroundTerminal(threadId: string, processId: string): Promise<{ terminated: boolean }> {
    return this.rpc.request("thread/backgroundTerminals/terminate", { threadId, processId });
  }

  getGoal(threadId: string): Promise<{ goal: AgentGoal | null }> {
    return this.rpc.request("thread/goal/get", { threadId });
  }

  setGoal(threadId: string, objective: string): Promise<{ goal: AgentGoal }> {
    return this.rpc.request("thread/goal/set", { threadId, objective });
  }

  clearGoal(threadId: string): Promise<{ cleared: boolean }> {
    return this.rpc.request("thread/goal/clear", { threadId });
  }

  setMemoryMode(threadId: string, mode: "enabled" | "disabled"): Promise<Record<string, never>> {
    return this.rpc.request("thread/memoryMode/set", { threadId, mode });
  }

  resetMemory(): Promise<Record<string, never>> {
    return this.rpc.request("memory/reset", undefined);
  }

  startReview(
    threadId: string,
    target:
      | { type: "uncommittedChanges" }
      | { type: "commit"; sha: string; title: string | null }
      | { type: "baseBranch"; branch: string }
      | { type: "custom"; instructions: string },
  ): Promise<{ turn: { id: string }; reviewThreadId: string }> {
    return this.rpc.request("review/start", {
      threadId,
      target,
      delivery: "inline",
    });
  }

  steer(
    threadId: string,
    expectedTurnId: string,
    input: CodexUserInput[],
    clientUserMessageId: string,
  ): Promise<{ turnId: string }> {
    return this.rpc.request("turn/steer", {
      threadId,
      expectedTurnId,
      clientUserMessageId,
      input,
    });
  }

  respond(requestId: RpcId, result: unknown): Promise<void> {
    return this.rpc.respond(requestId, result);
  }

  declineUnknown(requestId: RpcId): Promise<void> {
    return this.rpc.respondError(requestId, -32601, "Diese Client-Anfrage wird von l8git nicht unterstützt.");
  }

  async close(): Promise<void> {
    this.initialized = false;
    await this.rpc.close();
  }
}

export function sandboxPolicyFor(mode: AgentSandboxMode): Record<string, unknown> {
  return codexSandboxPolicy(mode);
}

export type CodexTurnPreferences = {
  model?: string;
  effort?: AgentReasoningEffort;
  approvalPolicy?: AgentApprovalPolicy;
  sandboxMode?: AgentSandboxMode;
};
