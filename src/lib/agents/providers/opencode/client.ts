import { invoke } from "@/lib/platform/ipc";

import { JsonRpcProcessClient, type RpcId } from "@/lib/agents/rpc-client";

export function openCodeCli(args: string[], cwd?: string): Promise<string> {
  return invoke<string>("opencode_cli", { args, cwd });
}

export function parseOpenCodeMcpServers(output: string): Array<{ name: string; status: string }> {
  return output
    .split("\n")
    .map((line) =>
      line
        .replace(/\u001B\[[0-9;]*m/gu, "")
        .replace(/^[\s│┌└├─╭╰]*/u, "")
        .replace(/^[●○▲▼✓✗✔✖•*-]+\s*/u, "")
        .trim(),
    )
    .filter(
      (line) =>
        line &&
        !/^MCP Servers/iu.test(line) &&
        !/^No MCP servers/iu.test(line) &&
        !/^Add servers with/iu.test(line),
    )
    .map((line) => {
      const [name, ...rest] = line.split(/\s{2,}|\s+-\s+|:\s+/u);
      return { name: name.trim(), status: rest.join(" ").trim() || "unknown" };
    })
    .filter((server) => /^[\w@./-]+$/u.test(server.name));
}

export interface OpenCodeConfigChoice {
  value: string;
  name: string;
  description?: string | null;
}

export interface OpenCodeConfigOption {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  type: "select" | "boolean";
  currentValue: string | boolean;
  options?: Array<OpenCodeConfigChoice | { group: string; name: string; options: OpenCodeConfigChoice[] }>;
}

export interface OpenCodeSessionConfig {
  sessionId?: string;
  configOptions?: OpenCodeConfigOption[] | null;
  models?: {
    currentModelId: string;
    availableModels: Array<{ modelId: string; name: string; description?: string | null }>;
  } | null;
  modes?: {
    currentModeId: string;
    availableModes: Array<{ id: string; name: string; description?: string | null }>;
  } | null;
}

export interface OpenCodeSessionListEntry {
  sessionId: string;
  cwd: string;
  title?: string | null;
  updatedAt?: string | null;
}

export interface OpenCodeInitializeResult {
  protocolVersion: number;
  agentInfo?: { name?: string; version?: string } | null;
  authMethods?: Array<{ id: string; name: string; description?: string | null }>;
  agentCapabilities?: Record<string, unknown>;
}

export type OpenCodeContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string; uri?: string }
  | { type: "resource_link"; uri: string; name: string; description?: string };

export interface OpenCodePermissionRequest {
  sessionId: string;
  toolCall: Record<string, unknown>;
  options: Array<{ optionId: string; name: string; kind: string }>;
}

export interface OpenCodeClientHandlers {
  onSessionUpdate: (sessionId: string, update: Record<string, unknown>) => void;
  onPermissionRequest: (requestId: RpcId, request: OpenCodePermissionRequest) => void;
  onDiagnostic?: (line: string) => void;
  onExit?: (code: number) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * ACP (Agent Client Protocol) adapter for `opencode acp`. A single process
 * serves every session of one repository because ACP multiplexes on
 * `sessionId` — unlike the Claude adapter there is no process per thread.
 */
export class OpenCodeClient {
  private readonly rpc: JsonRpcProcessClient;
  private disposers: Array<() => void> = [];

  constructor(
    readonly transportId: string,
    readonly cwd: string,
    private readonly handlers: OpenCodeClientHandlers,
  ) {
    this.rpc = new JsonRpcProcessClient(transportId);
  }

  async connect(): Promise<OpenCodeInitializeResult> {
    this.disposers.push(
      this.rpc.onNotification((notification) => {
        if (notification.method !== "session/update") return;
        const params = notification.params;
        const sessionId = typeof params?.sessionId === "string" ? params.sessionId : "";
        if (!sessionId || !isRecord(params?.update)) return;
        this.handlers.onSessionUpdate(sessionId, params.update);
      }),
      this.rpc.onServerRequest((request) => {
        if (request.method === "session/request_permission" && isRecord(request.params)) {
          this.handlers.onPermissionRequest(
            request.id,
            request.params as unknown as OpenCodePermissionRequest,
          );
          return;
        }
        void this.rpc.respondError(request.id, -32601, `Unsupported ACP request: ${request.method}`);
      }),
      this.rpc.onStatus((event) => {
        if (event.type === "stderr") this.handlers.onDiagnostic?.(String(event.value));
        else this.handlers.onExit?.(Number(event.value));
      }),
    );
    await this.rpc.connect("opencode");
    return this.rpc.request<OpenCodeInitializeResult>("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "l8git", version: "0.4.0" },
      // No fs/terminal capabilities on purpose: opencode reads files and runs
      // commands inside its own process, which keeps this adapter to chat.
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    });
  }

  authenticate(methodId: string): Promise<unknown> {
    return this.rpc.request("authenticate", { methodId });
  }

  logout(): Promise<unknown> {
    return this.rpc.request("logout");
  }

  newSession(): Promise<OpenCodeSessionConfig & { sessionId: string }> {
    return this.rpc.request("session/new", { cwd: this.cwd, mcpServers: [] });
  }

  loadSession(sessionId: string): Promise<OpenCodeSessionConfig> {
    return this.rpc.request("session/load", { sessionId, cwd: this.cwd, mcpServers: [] });
  }

  resumeSession(sessionId: string): Promise<OpenCodeSessionConfig> {
    return this.rpc.request("session/resume", { sessionId, cwd: this.cwd, mcpServers: [] });
  }

  forkSession(sessionId: string): Promise<OpenCodeSessionConfig & { sessionId: string }> {
    return this.rpc.request("session/fork", { sessionId, cwd: this.cwd, mcpServers: [] });
  }

  async listSessions(): Promise<OpenCodeSessionListEntry[]> {
    const sessions: OpenCodeSessionListEntry[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.rpc.request<{
        sessions?: OpenCodeSessionListEntry[];
        nextCursor?: string | null;
      }>("session/list", cursor ? { cwd: this.cwd, cursor } : { cwd: this.cwd });
      sessions.push(...(page.sessions ?? []));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && sessions.length < 500);
    return sessions;
  }

  closeSession(sessionId: string): Promise<unknown> {
    return this.rpc.request("session/close", { sessionId });
  }

  prompt(
    sessionId: string,
    prompt: OpenCodeContentBlock[],
  ): Promise<{
    stopReason: string;
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  }> {
    return this.rpc.request("session/prompt", { sessionId, prompt }, { timeoutMs: null });
  }

  cancel(sessionId: string): Promise<void> {
    return this.rpc.notify("session/cancel", { sessionId });
  }

  setModel(sessionId: string, modelId: string): Promise<unknown> {
    return this.rpc.request("session/set_model", { sessionId, modelId });
  }

  setMode(sessionId: string, modeId: string): Promise<unknown> {
    return this.rpc.request("session/set_mode", { sessionId, modeId });
  }

  setConfigOption(
    sessionId: string,
    configId: string,
    value: string | boolean,
  ): Promise<{ configOptions?: OpenCodeConfigOption[] }> {
    return this.rpc.request(
      "session/set_config_option",
      typeof value === "boolean"
        ? { sessionId, configId, type: "boolean", value }
        : { sessionId, configId, value },
    );
  }

  respondPermission(requestId: RpcId, optionId: string | null): Promise<void> {
    return this.rpc.respond(requestId, {
      outcome: optionId ? { outcome: "selected", optionId } : { outcome: "cancelled" },
    });
  }

  async close(): Promise<void> {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    await this.rpc.close();
  }
}
