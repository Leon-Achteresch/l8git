import {
  openAgentTransport,
  type AgentTransport,
  type AgentTransportOpenOptions,
} from "@/lib/agents/transport";

export interface ClaudeModel {
  value: string;
  displayName?: string;
  description?: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: string[];
}

export interface ClaudeCommand {
  name: string;
  description?: string;
  argumentHint?: string;
  aliases?: string[];
}

export interface ClaudeInitializeResult {
  commands?: ClaudeCommand[];
  agents?: Array<{ name?: string; description?: string }>;
  models?: ClaudeModel[];
  account?: Record<string, unknown>;
  skills?: Array<{ name?: string; description?: string; path?: string }>;
  plugins?: Array<Record<string, unknown>>;
  mcpServers?: Array<Record<string, unknown>>;
  permissionMode?: string;
  model?: string;
}

export interface ClaudeControlRequest {
  type: "control_request";
  request_id: string;
  request: Record<string, unknown> & { subtype?: string };
}

export interface ClaudeClientHandlers {
  onMessage: (message: Record<string, unknown>) => void;
  onControlRequest: (request: ClaudeControlRequest) => void;
  onControlCancel?: (requestId: string) => void;
  onDiagnostic?: (line: string) => void;
  onExit?: (code: number) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class ClaudeClient {
  private transport: AgentTransport | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  constructor(
    readonly sessionId: string,
    private readonly handlers: ClaudeClientHandlers,
  ) {}

  async connect(options: AgentTransportOpenOptions): Promise<ClaudeInitializeResult> {
    if (this.transport) return {};
    this.transport = await openAgentTransport(
      "claude",
      this.sessionId,
      {
        onMessage: (message) => this.handleMessage(message),
        onStderr: (line) => this.handlers.onDiagnostic?.(line),
        onExit: (code) => {
          this.transport = null;
          for (const pending of this.pending.values()) {
            pending.reject(new Error(`Claude Code wurde beendet (Exit ${code}).`));
          }
          this.pending.clear();
          this.handlers.onExit?.(code);
        },
      },
      options,
    );
    return (await this.request("initialize", {
      promptSuggestions: true,
      forwardSubagentText: true,
    })) as ClaudeInitializeResult;
  }

  private handleMessage(value: unknown) {
    if (!isRecord(value)) return;
    if (value.type === "control_response" && isRecord(value.response)) {
      const response = value.response;
      const requestId = typeof response.request_id === "string" ? response.request_id : "";
      const pending = this.pending.get(requestId);
      if (Array.isArray(response.pending_permission_requests)) {
        for (const candidate of response.pending_permission_requests) {
          if (isRecord(candidate) && candidate.type === "control_request") {
            this.handlers.onControlRequest(candidate as unknown as ClaudeControlRequest);
          }
        }
      }
      if (pending) {
        this.pending.delete(requestId);
        if (response.subtype === "error") {
          pending.reject(new Error(String(response.error ?? "Claude-Steuerungsanfrage ist fehlgeschlagen.")));
        } else {
          pending.resolve(response.response);
        }
      }
      return;
    }
    if (value.type === "control_request") {
      this.handlers.onControlRequest(value as unknown as ClaudeControlRequest);
      return;
    }
    if (value.type === "control_cancel_request") {
      this.handlers.onControlCancel?.(String(value.request_id ?? ""));
      return;
    }
    this.handlers.onMessage(value);
  }

  async request(subtype: string, body: Record<string, unknown> = {}): Promise<unknown> {
    const transport = this.transport;
    if (!transport) throw new Error("Claude Code ist nicht verbunden.");
    const requestId = `l8git-${this.nextRequestId++}`;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
    });
    try {
      await transport.send({
        type: "control_request",
        request_id: requestId,
        request: { subtype, ...body },
      });
    } catch (error) {
      this.pending.delete(requestId);
      throw error;
    }
    return promise;
  }

  async sendPrompt(content: string | Array<Record<string, unknown>>): Promise<void> {
    if (!this.transport) throw new Error("Claude Code ist nicht verbunden.");
    await this.transport.send({
      type: "user",
      message: { role: "user", content },
      parent_tool_use_id: null,
      session_id: "",
    });
  }

  async respond(requestId: string, response: Record<string, unknown>): Promise<void> {
    if (!this.transport) throw new Error("Claude Code ist nicht verbunden.");
    await this.transport.send({
      type: "control_response",
      response: { subtype: "success", request_id: requestId, response },
    });
  }

  async respondError(requestId: string, error: string): Promise<void> {
    if (!this.transport) throw new Error("Claude Code ist nicht verbunden.");
    await this.transport.send({
      type: "control_response",
      response: { subtype: "error", request_id: requestId, error },
    });
  }

  interrupt(): Promise<unknown> {
    return this.request("interrupt");
  }

  setModel(model: string | null): Promise<unknown> {
    return this.request("set_model", { model });
  }

  setPermissionMode(mode: string): Promise<unknown> {
    return this.request("set_permission_mode", { mode });
  }

  setMaxThinkingTokens(maxThinkingTokens: number): Promise<unknown> {
    return this.request("set_max_thinking_tokens", { max_thinking_tokens: maxThinkingTokens });
  }

  rename(title: string): Promise<unknown> {
    return this.request("rename_session", { title });
  }

  submitFeedback(description: string): Promise<unknown> {
    return this.request("submit_feedback", { description });
  }

  close(): Promise<void> {
    const transport = this.transport;
    this.transport = null;
    return transport?.close() ?? Promise.resolve();
  }
}
