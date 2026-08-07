import type { RpcId, RpcNotification, RpcServerRequest } from "@/lib/agents/rpc-client";
import { CodexAgentClient } from "@/lib/agents/providers/codex/client";
import type {
  CodexThreadRuntime,
  CodexThreadStartOptions,
} from "@/lib/agents/providers/codex/protocol";

const MAX_WARM_THREAD_SESSIONS = 2;
const ACTIVE_SURFACE_IDLE_MS = 60_000;
const HIDDEN_SURFACE_IDLE_MS = 5_000;
const CONTROL_IDLE_MS = 10_000;

export interface CodexSessionContext {
  sessionId: string;
  kind: "control" | "thread";
  threadId: string | null;
  path: string | null;
}

export interface CodexSessionStatusEvent {
  context: CodexSessionContext;
  type: "connecting" | "ready" | "diagnostic" | "exit" | "closed";
  value?: string | number;
}

interface SessionEntry {
  context: CodexSessionContext;
  client: CodexAgentClient;
  connectPromise: Promise<void> | null;
  connected: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
  lastUsedAt: number;
  readyThread: boolean;
  visible: boolean;
  activeTurn: boolean;
  pendingRequestIds: Set<string>;
  allowIdleWhileVisible: boolean;
  closing: boolean;
  disposers: Array<() => void>;
}

type EventListener = (context: CodexSessionContext, event: RpcNotification) => void;
type RequestListener = (context: CodexSessionContext, request: RpcServerRequest) => void;
type StatusListener = (event: CodexSessionStatusEvent) => void;

function randomId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${suffix}`;
}

function eventThreadId(event: RpcNotification | RpcServerRequest): string | null {
  const value = event.params?.threadId ?? event.params?.conversationId;
  return typeof value === "string" && value ? value : null;
}

function rpcIdKey(id: RpcId): string {
  return `${typeof id}:${String(id)}`;
}

/**
 * Owns independent Codex App Server processes. A process is created only for
 * the selected/new l8git session, never by enumerating or attaching to the
 * user's complete Codex CLI history. Idle, non-running processes are evicted.
 */
export class CodexSessionManager {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly sessionIdByThread = new Map<string, string>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly requestListeners = new Set<RequestListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private controlSessionId: string | null = null;
  private controlReferences = 0;
  private visibleThreadId: string | null = null;
  private surfaceReferences = 0;

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onRequest(listener: RequestListener): () => void {
    this.requestListeners.add(listener);
    return () => this.requestListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  retainSurface(): () => void {
    this.surfaceReferences += 1;
    for (const entry of this.sessions.values()) this.cancelIdle(entry);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.surfaceReferences = Math.max(0, this.surfaceReferences - 1);
      if (this.surfaceReferences === 0) {
        this.setVisibleThread(null);
        for (const entry of this.sessions.values()) this.scheduleIdle(entry);
      }
    };
  }

  setVisibleThread(threadId: string | null): void {
    this.visibleThreadId = threadId;
    for (const entry of this.sessions.values()) {
      if (entry.context.kind !== "thread") continue;
      entry.visible = entry.context.threadId === threadId;
      if (entry.visible) {
        this.touch(entry);
        this.cancelIdle(entry);
      } else {
        this.scheduleIdle(entry);
      }
    }
  }

  async controlClient(): Promise<CodexAgentClient> {
    let entry = this.controlSessionId ? this.sessions.get(this.controlSessionId) : undefined;
    if (!entry) {
      entry = this.createEntry({
        sessionId: randomId("codex-control"),
        kind: "control",
        threadId: null,
        path: null,
      });
      this.controlSessionId = entry.context.sessionId;
    }
    entry.allowIdleWhileVisible = false;
    await this.connectEntry(entry);
    this.controlReferences += 1;
    this.touch(entry);
    return entry.client;
  }

  releaseControl(): void {
    this.controlReferences = Math.max(0, this.controlReferences - 1);
    if (this.controlReferences > 0) return;
    const entry = this.controlSessionId ? this.sessions.get(this.controlSessionId) : undefined;
    if (!entry) return;
    entry.allowIdleWhileVisible = true;
    this.scheduleIdle(entry);
  }

  async startThread(
    options: CodexThreadStartOptions,
  ): Promise<{ client: CodexAgentClient; runtime: CodexThreadRuntime }> {
    const entry = this.createEntry({
      sessionId: randomId("codex-thread"),
      kind: "thread",
      threadId: null,
      path: options.cwd,
    });
    try {
      await this.connectEntry(entry);
      const runtime = await entry.client.startThread(options);
      this.bindThread(entry, runtime.thread.id, runtime.cwd);
      entry.readyThread = true;
      this.touch(entry);
      this.evictOverflow(entry.context.sessionId);
      return { client: entry.client, runtime };
    } catch (error) {
      await this.closeEntry(entry, false);
      throw error;
    }
  }

  async threadClient(
    threadId: string,
    path: string,
  ): Promise<{ client: CodexAgentClient; runtime: CodexThreadRuntime | null }> {
    let entry = this.entryForThread(threadId);
    if (!entry) {
      entry = this.createEntry({
        sessionId: randomId("codex-thread"),
        kind: "thread",
        threadId,
        path,
      });
      this.sessionIdByThread.set(threadId, entry.context.sessionId);
    }
    await this.connectEntry(entry);
    let runtime: CodexThreadRuntime | null = null;
    try {
      if (!entry.readyThread) {
        runtime = await entry.client.resumeThread(threadId);
        entry.readyThread = true;
        entry.context.path = runtime.cwd || path;
      }
    } catch (error) {
      await this.closeEntry(entry, false);
      throw error;
    }
    this.touch(entry);
    this.evictOverflow(entry.context.sessionId);
    return { client: entry.client, runtime };
  }

  clientForSession(sessionId: string): CodexAgentClient | null {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.closing) return null;
    this.touch(entry);
    return entry.client;
  }

  sessionIdForThread(threadId: string): string | null {
    return this.sessionIdByThread.get(threadId) ?? null;
  }

  resolveRequest(sessionId: string, requestId: RpcId): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    entry.pendingRequestIds.delete(rpcIdKey(requestId));
    this.touch(entry);
    this.scheduleIdle(entry);
    this.evictOverflow();
  }

  async closeThread(threadId: string): Promise<void> {
    const entry = this.entryForThread(threadId);
    if (entry) await this.closeEntry(entry, true);
  }

  async closeAll(): Promise<void> {
    const entries = [...this.sessions.values()];
    await Promise.all(entries.map((entry) => this.closeEntry(entry, true)));
  }

  private createEntry(context: CodexSessionContext): SessionEntry {
    const client = new CodexAgentClient(context.sessionId);
    const entry: SessionEntry = {
      context,
      client,
      connectPromise: null,
      connected: false,
      idleTimer: null,
      lastUsedAt: Date.now(),
      readyThread: false,
      visible: context.threadId === this.visibleThreadId,
      activeTurn: false,
      pendingRequestIds: new Set(),
      allowIdleWhileVisible: false,
      closing: false,
      disposers: [],
    };
    entry.disposers.push(
      client.onEvent((event) => this.handleEvent(entry, event)),
      client.onRequest((request) => this.handleRequest(entry, request)),
      client.onStatus((event) => this.handleStatus(entry, event)),
    );
    this.sessions.set(context.sessionId, entry);
    return entry;
  }

  private async connectEntry(entry: SessionEntry): Promise<void> {
    if (entry.closing) throw new Error("Die Codex-Session wurde bereits geschlossen.");
    this.cancelIdle(entry);
    if (entry.connected) return;
    if (!entry.connectPromise) {
      this.emitStatus({ context: { ...entry.context }, type: "connecting" });
      entry.connectPromise = entry.client.connect()
        .then(() => {
          if (entry.closing) return;
          entry.connected = true;
          this.emitStatus({ context: { ...entry.context }, type: "ready" });
        })
        .finally(() => {
          entry.connectPromise = null;
        });
    }
    await entry.connectPromise;
    if (entry.closing || !entry.connected) {
      throw new Error("Die Codex-Session wurde während des Verbindens geschlossen.");
    }
  }

  private bindThread(entry: SessionEntry, threadId: string, path: string): void {
    const previousSessionId = this.sessionIdByThread.get(threadId);
    if (previousSessionId && previousSessionId !== entry.context.sessionId) {
      const previous = this.sessions.get(previousSessionId);
      if (previous) void this.closeEntry(previous, true);
    }
    entry.context.threadId = threadId;
    entry.context.path = path;
    entry.visible = threadId === this.visibleThreadId;
    this.sessionIdByThread.set(threadId, entry.context.sessionId);
  }

  private handleEvent(entry: SessionEntry, event: RpcNotification): void {
    if (entry.closing) return;
    const incomingThreadId = eventThreadId(event);
    if (
      entry.context.kind === "thread" &&
      entry.context.threadId &&
      incomingThreadId &&
      incomingThreadId !== entry.context.threadId
    ) {
      this.emitStatus({
        context: { ...entry.context },
        type: "diagnostic",
        value: `Fremdes Thread-Event ${event.method} für ${incomingThreadId} wurde isoliert.`,
      });
      return;
    }
    if (event.method === "turn/started") entry.activeTurn = true;
    if (event.method === "turn/completed") entry.activeTurn = false;
    if (event.method === "serverRequest/resolved") {
      const requestId = event.params?.requestId;
      if (typeof requestId === "string" || typeof requestId === "number") {
        entry.pendingRequestIds.delete(rpcIdKey(requestId));
      }
    }
    this.touch(entry);
    for (const listener of this.eventListeners) listener({ ...entry.context }, event);
    if (!this.isBusy(entry)) this.scheduleIdle(entry);
  }

  private handleRequest(entry: SessionEntry, request: RpcServerRequest): void {
    if (entry.closing) return;
    const incomingThreadId = eventThreadId(request);
    if (
      entry.context.kind === "thread" &&
      entry.context.threadId &&
      incomingThreadId &&
      incomingThreadId !== entry.context.threadId
    ) {
      void entry.client.declineUnknown(request.id).catch(() => {});
      return;
    }
    entry.pendingRequestIds.add(rpcIdKey(request.id));
    this.touch(entry);
    for (const listener of this.requestListeners) listener({ ...entry.context }, request);
  }

  private handleStatus(
    entry: SessionEntry,
    event: { type: "stderr" | "exit"; value: string | number },
  ): void {
    if (event.type === "stderr") {
      this.emitStatus({
        context: { ...entry.context },
        type: "diagnostic",
        value: event.value,
      });
      return;
    }
    if (entry.closing) return;
    entry.closing = true;
    entry.connected = false;
    this.cancelIdle(entry);
    this.removeEntry(entry);
    for (const dispose of entry.disposers.splice(0)) dispose();
    this.emitStatus({ context: { ...entry.context }, type: "exit", value: event.value });
  }

  private entryForThread(threadId: string): SessionEntry | undefined {
    const sessionId = this.sessionIdByThread.get(threadId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  private touch(entry: SessionEntry): void {
    entry.lastUsedAt = Date.now();
    this.cancelIdle(entry);
  }

  private scheduleIdle(entry: SessionEntry): void {
    if (entry.closing || this.isBusy(entry) || entry.visible || entry.idleTimer) return;
    if (
      entry.context.kind === "control" &&
      this.surfaceReferences > 0 &&
      !entry.allowIdleWhileVisible
    ) return;
    const delay = entry.context.kind === "control"
      ? CONTROL_IDLE_MS
      : this.surfaceReferences > 0
        ? ACTIVE_SURFACE_IDLE_MS
        : HIDDEN_SURFACE_IDLE_MS;
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = null;
      if (!this.isBusy(entry) && !entry.visible) void this.closeEntry(entry, false);
    }, delay);
  }

  private cancelIdle(entry: SessionEntry): void {
    if (!entry.idleTimer) return;
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }

  private evictOverflow(exceptSessionId?: string): void {
    const threadEntries = [...this.sessions.values()].filter(
      (entry) => entry.context.kind === "thread" && !entry.closing,
    );
    let overflow = threadEntries.length - MAX_WARM_THREAD_SESSIONS;
    if (overflow <= 0) return;
    const candidates = threadEntries
      .filter(
        (entry) =>
          entry.context.sessionId !== exceptSessionId && !entry.visible && !this.isBusy(entry),
      )
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    for (const entry of candidates) {
      if (overflow <= 0) break;
      overflow -= 1;
      void this.closeEntry(entry, false);
    }
  }

  private async closeEntry(entry: SessionEntry, explicit: boolean): Promise<void> {
    if (entry.closing) return;
    entry.closing = true;
    entry.connected = false;
    this.cancelIdle(entry);
    this.removeEntry(entry);
    for (const dispose of entry.disposers.splice(0)) dispose();
    await entry.client.close().catch(() => {});
    this.emitStatus({
      context: { ...entry.context },
      type: "closed",
      value: explicit ? "explicit" : "idle",
    });
  }

  private isBusy(entry: SessionEntry): boolean {
    return entry.activeTurn || entry.pendingRequestIds.size > 0;
  }

  private removeEntry(entry: SessionEntry): void {
    this.sessions.delete(entry.context.sessionId);
    if (entry.context.threadId) {
      const mapped = this.sessionIdByThread.get(entry.context.threadId);
      if (mapped === entry.context.sessionId) this.sessionIdByThread.delete(entry.context.threadId);
    }
    if (this.controlSessionId === entry.context.sessionId) {
      this.controlSessionId = null;
      this.controlReferences = 0;
    }
  }

  private emitStatus(event: CodexSessionStatusEvent): void {
    for (const listener of this.statusListeners) listener(event);
  }
}

export const codexSessionManager = new CodexSessionManager();
