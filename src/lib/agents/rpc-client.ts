import {
  openAgentTransport,
  type AgentTransport,
  type AgentTransportProvider,
} from "@/lib/agents/transport";

export type RpcId = number | string;
export type RpcParams = Record<string, unknown> | undefined;

export interface RpcNotification {
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcServerRequest extends RpcNotification {
  id: RpcId;
}

interface RpcResponse {
  id: RpcId;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

type NotificationListener = (notification: RpcNotification) => void;
type ServerRequestListener = (request: RpcServerRequest) => void;
type StatusListener = (event: { type: "stderr" | "exit"; value: string | number }) => void;

const RPC_REQUEST_TIMEOUT_MS = 120_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rpcError(error: RpcResponse["error"]): Error {
  const result = new Error(error?.message || "Der Agent hat die Anfrage abgelehnt.");
  result.name = typeof error?.code === "number" ? `RpcError(${error.code})` : "RpcError";
  return result;
}

export class JsonRpcProcessClient {
  private transport: AgentTransport | null = null;
  private connectPromise: Promise<void> | null = null;
  private nextId = 1;
  private lastStreamSequence = 0;
  private closed = false;
  private readonly pending = new Map<RpcId, PendingRequest>();
  private readonly notifications = new Set<NotificationListener>();
  private readonly serverRequests = new Set<ServerRequestListener>();
  private readonly statusListeners = new Set<StatusListener>();

  constructor(readonly sessionId: string) {}

  async connect(provider: AgentTransportProvider): Promise<void> {
    if (this.transport) return;
    if (this.connectPromise) return this.connectPromise;
    this.closed = false;
    this.lastStreamSequence = 0;
    this.connectPromise = openAgentTransport(provider, this.sessionId, {
      onMessage: (message, sequence) => {
        if (sequence <= this.lastStreamSequence) {
          this.emitStatus({
            type: "stderr",
            value: `Veraltetes JSON-Frame ${sequence} in ${this.sessionId} wurde verworfen.`,
          });
          return;
        }
        this.lastStreamSequence = sequence;
        this.receive(message);
      },
      onStderr: (line) => this.emitStatus({ type: "stderr", value: line }),
      onExit: (code) => {
        this.transport = null;
        this.rejectPending(new Error(`Agent-Prozess wurde beendet (Code ${code}).`));
        this.emitStatus({ type: "exit", value: code });
      },
    })
      .then((transport) => {
        this.transport = transport;
      })
      .finally(() => {
        this.connectPromise = null;
      });
    return this.connectPromise;
  }

  async request<T>(method: string, params?: RpcParams): Promise<T> {
    if (!this.transport || this.closed) {
      throw new Error("Der Agent ist nicht verbunden.");
    }
    const id = this.nextId++;
    const payload = params === undefined ? { method, id } : { method, id, params };
    const response = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout: setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`Agent-Anfrage ${method} hat das Zeitlimit überschritten.`));
        }, RPC_REQUEST_TIMEOUT_MS),
      });
    });
    try {
      await this.transport.send(payload);
    } catch (error) {
      const pending = this.pending.get(id);
      if (pending) clearTimeout(pending.timeout);
      this.pending.delete(id);
      throw error;
    }
    return response;
  }

  async notify(method: string, params?: RpcParams): Promise<void> {
    if (!this.transport || this.closed) {
      throw new Error("Der Agent ist nicht verbunden.");
    }
    const payload = params === undefined ? { method } : { method, params };
    await this.transport.send(payload);
  }

  async respond(id: RpcId, result: unknown): Promise<void> {
    if (!this.transport || this.closed) {
      throw new Error("Der Agent ist nicht verbunden.");
    }
    await this.transport.send({ id, result });
  }

  async respondError(id: RpcId, code: number, message: string): Promise<void> {
    if (!this.transport || this.closed) {
      throw new Error("Der Agent ist nicht verbunden.");
    }
    await this.transport.send({ id, error: { code, message } });
  }

  onNotification(listener: NotificationListener): () => void {
    this.notifications.add(listener);
    return () => this.notifications.delete(listener);
  }

  onServerRequest(listener: ServerRequestListener): () => void {
    this.serverRequests.add(listener);
    return () => this.serverRequests.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  async close(): Promise<void> {
    if (this.closed && !this.connectPromise && !this.transport) return;
    this.closed = true;
    await this.connectPromise?.catch(() => {});
    const transport = this.transport;
    this.transport = null;
    this.rejectPending(new Error("Agent-Verbindung wurde geschlossen."));
    await transport?.close();
  }

  private receive(message: unknown): void {
    if (!isRecord(message)) return;
    const id = message.id;
    const method = message.method;
    if ((typeof id === "number" || typeof id === "string") && typeof method === "string") {
      const params = isRecord(message.params) ? message.params : undefined;
      for (const listener of this.serverRequests) listener({ id, method, params });
      return;
    }
    if (typeof id === "number" || typeof id === "string") {
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      clearTimeout(pending.timeout);
      const error = isRecord(message.error)
        ? {
            code: typeof message.error.code === "number" ? message.error.code : undefined,
            message: typeof message.error.message === "string" ? message.error.message : undefined,
            data: message.error.data,
          }
        : undefined;
      if (error) pending.reject(rpcError(error));
      else pending.resolve(message.result);
      return;
    }
    if (typeof method === "string") {
      const params = isRecord(message.params) ? message.params : undefined;
      for (const listener of this.notifications) listener({ method, params });
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private emitStatus(event: { type: "stderr" | "exit"; value: string | number }): void {
    for (const listener of this.statusListeners) listener(event);
  }
}
