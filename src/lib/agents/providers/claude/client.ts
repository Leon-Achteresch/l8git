import {
  openAgentTransport,
  type AgentTransport,
  type AgentTransportOpenOptions,
} from "@/lib/agents/transport";
import type {
  AgentCapability,
  AgentProviderAdapter,
  DriverKind,
  InstanceId,
  NativeSessionRef,
  ThreadId,
} from "@/lib/agents/types";
import { driverKind, nativeSessionId as toNativeSessionId } from "@/lib/agents/types";

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
  onSequenceGap?: (info: { expected: number; received: number }) => void;
}

export interface ClaudeRequestOptions {
  timeoutMs?: number | null;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const CLAUDE_INIT_TIMEOUT_MS = 30_000;
const CLAUDE_CONTROL_TIMEOUT_MS = 30_000;

export class ClaudeClient {
  private transport: AgentTransport | null = null;
  private nextRequestId = 1;
  private lastSequence = 0;
  private ready = false;
  private readyDeferred: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private readonly pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  constructor(
    readonly sessionId: string,
    private readonly handlers: ClaudeClientHandlers,
  ) {}

  isReady(): boolean {
    return this.ready;
  }

  async connect(options: AgentTransportOpenOptions): Promise<ClaudeInitializeResult> {
    if (this.transport) return {};
    this.ready = false;
    this.lastSequence = 0;
    const readyPromise = new Promise<void>((resolve, reject) => {
      this.readyDeferred = { resolve, reject };
    });
    this.transport = await openAgentTransport(
      "claude",
      this.sessionId,
      {
        onMessage: (message, sequence) => this.handleIncoming(message, sequence),
        onStderr: (line) => this.handlers.onDiagnostic?.(line),
        onExit: (code) => {
          this.transport = null;
          this.ready = false;
          const error = new Error(`Claude Code wurde beendet (Exit ${code}).`);
          for (const pending of this.pending.values()) pending.reject(error);
          this.pending.clear();
          this.readyDeferred?.reject(error);
          this.readyDeferred = null;
          this.handlers.onExit?.(code);
        },
      },
      options,
    );
    const initResultPromise = this.request("initialize", {
      promptSuggestions: true,
      forwardSubagentText: true,
    }) as Promise<ClaudeInitializeResult>;
    let initTimer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      initTimer = setTimeout(() => {
        reject(
          new Error(
            `Claude Code hat die Initialisierung nicht innerhalb von ${CLAUDE_INIT_TIMEOUT_MS / 1000}s abgeschlossen.`,
          ),
        );
      }, CLAUDE_INIT_TIMEOUT_MS);
    });
    try {
      const [initResult] = await Promise.all([
        Promise.race([initResultPromise, timeout]),
        Promise.race([readyPromise, timeout]),
      ]);
      this.ready = true;
      this.readyDeferred = null;
      return initResult;
    } catch (error) {
      this.ready = false;
      this.readyDeferred = null;
      const transport = this.transport;
      this.transport = null;
      await transport?.close().catch(() => {});
      throw error;
    } finally {
      if (initTimer) clearTimeout(initTimer);
    }
  }

  private handleIncoming(message: unknown, sequence: number): void {
    if (sequence <= this.lastSequence) {
      this.handlers.onDiagnostic?.(`Doppeltes oder veraltetes Ereignis ${sequence} wurde verworfen.`);
      return;
    }
    if (this.lastSequence !== 0 && sequence > this.lastSequence + 1) {
      this.handlers.onSequenceGap?.({ expected: this.lastSequence + 1, received: sequence });
    }
    this.lastSequence = sequence;
    this.handleMessage(message);
  }

  private handleMessage(value: unknown) {
    if (!isRecord(value)) return;
    if (value.type === "system" && value.subtype === "init") {
      this.readyDeferred?.resolve();
      this.handlers.onMessage(value);
      return;
    }
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

  async request(
    subtype: string,
    body: Record<string, unknown> = {},
    options?: ClaudeRequestOptions,
  ): Promise<unknown> {
    const transport = this.transport;
    if (!transport) throw new Error("Claude Code ist nicht verbunden.");
    const requestId = `l8git-${this.nextRequestId++}`;
    const timeoutMs = options?.timeoutMs === undefined ? CLAUDE_CONTROL_TIMEOUT_MS : options.timeoutMs;
    const promise = new Promise<unknown>((resolve, reject) => {
      if (options?.signal?.aborted) {
        reject(new Error(`Claude-Steuerungsanfrage ${subtype} wurde abgebrochen.`));
        return;
      }
      const timeout =
        timeoutMs === null || timeoutMs <= 0
          ? null
          : setTimeout(() => {
              this.pending.delete(requestId);
              reject(new Error(`Claude-Steuerungsanfrage ${subtype} hat das Zeitlimit überschritten.`));
            }, timeoutMs);
      const onAbort = () => {
        if (!this.pending.delete(requestId)) return;
        if (timeout) clearTimeout(timeout);
        reject(new Error(`Claude-Steuerungsanfrage ${subtype} wurde abgebrochen.`));
      };
      options?.signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(requestId, {
        resolve: (value) => {
          if (timeout) clearTimeout(timeout);
          options?.signal?.removeEventListener("abort", onAbort);
          resolve(value);
        },
        reject: (error) => {
          if (timeout) clearTimeout(timeout);
          options?.signal?.removeEventListener("abort", onAbort);
          reject(error);
        },
      });
    });
    try {
      await transport.send({
        type: "control_request",
        request_id: requestId,
        request: { subtype, ...body },
      });
    } catch (error) {
      const pending = this.pending.get(requestId);
      if (pending) {
        this.pending.delete(requestId);
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return promise;
  }

  async sendPrompt(content: string | Array<Record<string, unknown>>): Promise<void> {
    if (!this.transport) throw new Error("Claude Code ist nicht verbunden.");
    if (!this.ready) throw new Error("Claude-Session ist noch nicht bereit (Initialisierung ausstehend).");
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
    this.ready = false;
    const closeError = new Error("Claude-Verbindung wurde geschlossen.");
    for (const pending of this.pending.values()) pending.reject(closeError);
    this.pending.clear();
    this.readyDeferred?.reject(closeError);
    this.readyDeferred = null;
    return transport?.close() ?? Promise.resolve();
  }
}

export class ClaudeProviderAdapter implements AgentProviderAdapter {
  readonly driver: DriverKind = driverKind("claude");
  private readonly clients = new Map<string, ClaudeClient>();

  async start(instance: InstanceId): Promise<NativeSessionRef> {
    const sessionId = `claude:${instance}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const client = new ClaudeClient(sessionId, {
      onMessage: () => {},
      onControlRequest: (request) => {
        client
          .respondError(
            request.request_id,
            `Nicht unterstützte Steuerungsanfrage außerhalb der Chat-Session: ${request.request.subtype ?? "unbekannt"}`,
          )
          .catch((error) => console.warn("Claude control_response fehlgeschlagen", error));
      },
    });
    await client.connect({});
    this.clients.set(sessionId, client);
    return { driver: this.driver, instance, nativeSessionId: toNativeSessionId(sessionId) };
  }

  async send(threadId: ThreadId, text: string): Promise<void> {
    await this.requireClient(threadId).sendPrompt(text);
  }

  async interrupt(threadId: ThreadId): Promise<void> {
    await this.requireClient(threadId).interrupt();
  }

  async stop(threadId: ThreadId): Promise<void> {
    const client = this.clients.get(threadId);
    if (!client) return;
    this.clients.delete(threadId);
    await client.close();
  }

  async resume(threadId: ThreadId, ref: NativeSessionRef): Promise<void> {
    const existing = this.clients.get(threadId);
    if (existing) return;
    const client = new ClaudeClient(ref.nativeSessionId, {
      onMessage: () => {},
      onControlRequest: (request) => {
        client
          .respondError(
            request.request_id,
            `Nicht unterstützte Steuerungsanfrage außerhalb der Chat-Session: ${request.request.subtype ?? "unbekannt"}`,
          )
          .catch((error) => console.warn("Claude control_response fehlgeschlagen", error));
      },
    });
    await client.connect({ resume: true, resumeSessionId: ref.nativeSessionId });
    this.clients.set(threadId, client);
  }

  capability(name: string): AgentCapability {
    switch (name) {
      case "history":
      case "approvals":
      case "models":
      case "images":
      case "tools":
        return { status: "supported" };
      default:
        return { status: "unavailable", reason: `Unbekannte Capability ${name}` };
    }
  }

  private requireClient(threadId: ThreadId): ClaudeClient {
    const client = this.clients.get(threadId);
    if (!client) throw new Error(`Keine Claude-Session für Thread ${threadId} vorhanden.`);
    return client;
  }
}
