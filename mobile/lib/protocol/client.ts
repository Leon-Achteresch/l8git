import {
  PROTOCOL_VERSION,
  authTag,
  decodeFixed,
  decodePsk,
  deriveSessionKeys,
  generateEphemeralKeyPair,
  handshakeTag,
  randomHelloNonce,
  toBase64,
  verifyTag,
} from './crypto';
import {
  CHANNEL_SENTINEL_KEY,
  FrameCodec,
  type Frame,
  type HostInfo,
  type ServerFrame,
  encodeHello,
  parseWelcome,
} from './frames';

export type { HostInfo } from './frames';

export interface HostPairing {
  v: number;
  hostId: string;
  psk: string;
  name?: string;
  endpoints: string[];
}

export type ProtocolClientStatus = 'idle' | 'connecting' | 'ready' | 'closed' | 'error';

export interface SocketOptions {
  headers?: Record<string, string>;
}

export interface SocketLike {
  binaryType?: string;
  send(data: string | ArrayBuffer | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
}

export type SocketFactory = (url: string, options?: SocketOptions) => SocketLike;

export interface ProtocolClientOptions {
  socketFactory?: SocketFactory;
  connectTimeoutMs?: number;
  handshakeTimeoutMs?: number;
  pingIntervalMs?: number;
  pingTimeoutMs?: number;
  requestTimeoutMs?: number;
  now?: () => number;
}

export interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class ProtocolError extends Error {
  readonly kind: 'transport' | 'handshake' | 'remote' | 'canceled';

  constructor(message: string, kind: ProtocolError['kind'] = 'transport') {
    super(message);
    this.name = 'ProtocolError';
    this.kind = kind;
  }
}

const CHANNEL_BRAND = '__l8gitChannelArg__';

class ChannelArg<T> {
  readonly [CHANNEL_BRAND] = true;

  constructor(readonly onMessage: (message: T) => void) {}
}

export function channelArg<T>(onMessage: (message: T) => void): unknown {
  return new ChannelArg(onMessage);
}

export function isChannelArg(value: unknown): value is ChannelArg<unknown> {
  return value instanceof ChannelArg;
}

export function parsePairing(raw: string): HostPairing {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new Error('pairing payload is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('pairing payload is not an object');
  }
  const value = parsed as Partial<HostPairing>;
  if (typeof value.hostId !== 'string' || value.hostId.length === 0) {
    throw new Error('pairing payload is missing hostId');
  }
  if (typeof value.psk !== 'string') {
    throw new Error('pairing payload is missing psk');
  }
  decodePsk(value.psk);
  const endpoints = Array.isArray(value.endpoints)
    ? value.endpoints.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  if (endpoints.length === 0) {
    throw new Error('pairing payload has no endpoints');
  }
  const version = typeof value.v === 'number' ? value.v : PROTOCOL_VERSION;
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`unsupported pairing version ${version}`);
  }
  return {
    v: version,
    hostId: value.hostId,
    psk: value.psk,
    name: typeof value.name === 'string' ? value.name : undefined,
    endpoints,
  };
}

function defaultSocketFactory(url: string, options?: SocketOptions): SocketLike {
  const Ctor = globalThis.WebSocket as unknown as new (
    url: string,
    protocols?: string | string[] | null,
    options?: SocketOptions
  ) => SocketLike;
  if (!Ctor) {
    throw new ProtocolError('no WebSocket implementation available');
  }
  return new Ctor(url, null, options);
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  detachSignal: (() => void) | null;
}

interface PendingPing {
  sentAt: number;
  token: number;
  timer: ReturnType<typeof setTimeout>;
  waiters: { resolve: (rtt: number) => void; reject: (error: Error) => void }[];
}

export type StatusListener = (status: ProtocolClientStatus, error?: string) => void;

export class ProtocolClient {
  private readonly options: Required<Omit<ProtocolClientOptions, 'socketFactory' | 'now'>> & {
    socketFactory: SocketFactory;
    now: () => number;
  };

  private socket: SocketLike | null = null;
  private codec: FrameCodec | null = null;
  private state: ProtocolClientStatus = 'idle';
  private error: string | null = null;
  private info: HostInfo | null = null;
  private url: string | null = null;
  private id: string | null = null;
  private rtt: number | null = null;
  private nextRequestId = 1;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pendingPing: PendingPing | null = null;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly channels = new Map<number, Map<string, (message: unknown) => void>>();
  private readonly events = new Map<string, Set<(payload: unknown) => void>>();
  private readonly statusListeners = new Set<StatusListener>();

  constructor(options: ProtocolClientOptions = {}) {
    this.options = {
      socketFactory: options.socketFactory ?? defaultSocketFactory,
      connectTimeoutMs: options.connectTimeoutMs ?? 8_000,
      handshakeTimeoutMs: options.handshakeTimeoutMs ?? 8_000,
      pingIntervalMs: options.pingIntervalMs ?? 20_000,
      pingTimeoutMs: options.pingTimeoutMs ?? 10_000,
      requestTimeoutMs: options.requestTimeoutMs ?? 0,
      now: options.now ?? (() => Date.now()),
    };
  }

  get status(): ProtocolClientStatus {
    return this.state;
  }

  get hostId(): string | null {
    return this.id;
  }

  get hostInfo(): HostInfo | null {
    return this.info;
  }

  get endpoint(): string | null {
    return this.url;
  }

  get latencyMs(): number | null {
    return this.rtt;
  }

  get lastError(): string | null {
    return this.error;
  }

  get isReady(): boolean {
    return this.state === 'ready';
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  on(event: string, listener: (payload: unknown) => void): () => void {
    let set = this.events.get(event);
    if (!set) {
      set = new Set();
      this.events.set(event, set);
    }
    set.add(listener);
    return () => {
      const current = this.events.get(event);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.events.delete(event);
      }
    };
  }

  channel<T>(onMessage: (message: T) => void): unknown {
    return channelArg(onMessage);
  }

  async connect(
    endpoint: string,
    pairing: HostPairing,
    socketOptions?: SocketOptions
  ): Promise<HostInfo> {
    if (this.state === 'connecting' || this.state === 'ready') {
      throw new ProtocolError('client is already connected');
    }
    const psk = decodePsk(pairing.psk);
    this.state = 'connecting';
    this.error = null;
    this.url = endpoint;
    this.id = pairing.hostId;
    this.emitStatus();

    const socket = this.options.socketFactory(endpoint, socketOptions);
    this.socket = socket;
    socket.binaryType = 'arraybuffer';

    const keys = generateEphemeralKeyPair();
    const nonce = randomHelloNonce();

    return new Promise<HostInfo>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        fail(new ProtocolError('connection timed out', 'handshake'));
      }, this.options.connectTimeoutMs + this.options.handshakeTimeoutMs);

      const clearTimer = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      const fail = (cause: Error) => {
        if (settled) return;
        settled = true;
        clearTimer();
        this.failWith(cause.message);
        reject(cause);
      };

      const succeed = (host: HostInfo) => {
        if (settled) return;
        settled = true;
        clearTimer();
        resolve(host);
      };

      socket.onopen = () => {
        try {
          socket.send(
            encodeHello({
              v: PROTOCOL_VERSION,
              type: 'hello',
              hostId: pairing.hostId,
              eph: toBase64(keys.publicKey),
              nonce: toBase64(nonce),
            })
          );
        } catch (cause) {
          fail(new ProtocolError(messageOf(cause), 'transport'));
        }
      };

      socket.onerror = (event) => {
        fail(new ProtocolError(socketErrorMessage(event), 'transport'));
      };

      socket.onclose = (event) => {
        const reason = closeReason(event);
        if (!settled) {
          fail(new ProtocolError(reason, 'transport'));
          return;
        }
        this.handleClose(reason);
      };

      socket.onmessage = (event) => {
        if (settled) {
          this.handleFrame(event.data);
          return;
        }
        try {
          if (this.codec) {
            const frame = this.codec.decode(event.data);
            if (frame.type !== 'ready') {
              throw new ProtocolError(`expected ready, received ${frame.type}`, 'handshake');
            }
            this.info = frame.host ?? {};
            this.state = 'ready';
            this.emitStatus();
            this.startPingLoop();
            succeed(this.info);
            return;
          }
          if (typeof event.data !== 'string') {
            throw new ProtocolError('expected the welcome message as text', 'handshake');
          }
          const welcome = parseWelcome(event.data);
          const serverEph = decodeFixed(welcome.eph, 32, 'server ephemeral key');
          if (!verifyTag(handshakeTag(psk, keys.publicKey, serverEph, nonce), welcome.tag)) {
            throw new ProtocolError('handshake tag mismatch', 'handshake');
          }
          const session = deriveSessionKeys(keys.secretKey, serverEph, psk);
          this.codec = new FrameCodec(session.c2s, session.s2c);
          socket.send(
            asArrayBuffer(
              this.codec.encode({
                type: 'auth',
                tag: toBase64(authTag(psk, keys.publicKey, serverEph, nonce)),
              })
            )
          );
        } catch (cause) {
          fail(
            cause instanceof ProtocolError
              ? cause
              : new ProtocolError(messageOf(cause), 'handshake')
          );
        }
      };
    });
  }

  async request<T>(
    cmd: string,
    args: Record<string, unknown> = {},
    options: RequestOptions = {}
  ): Promise<T> {
    if (this.state !== 'ready' || !this.codec) {
      throw new ProtocolError('not connected');
    }
    if (options.signal?.aborted) {
      throw new ProtocolError('request aborted', 'canceled');
    }

    const id = this.nextRequestId;
    this.nextRequestId += 1;

    const wireArgs: Record<string, unknown> = {};
    let handlers: Map<string, (message: unknown) => void> | null = null;
    for (const [key, value] of Object.entries(args)) {
      if (isChannelArg(value)) {
        if (!handlers) {
          handlers = new Map();
          this.channels.set(id, handlers);
        }
        handlers.set(key, value.onMessage as (message: unknown) => void);
        wireArgs[key] = { [CHANNEL_SENTINEL_KEY]: true };
        continue;
      }
      wireArgs[key] = value;
    }

    return new Promise<T>((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? this.options.requestTimeoutMs;
      const entry: PendingRequest = {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer: null,
        detachSignal: null,
      };

      if (timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          this.settle(id, false, new ProtocolError(`request ${cmd} timed out`));
          this.sendCancel(id);
        }, timeoutMs);
      }

      const { signal } = options;
      if (signal) {
        const onAbort = () => {
          this.settle(id, false, new ProtocolError('request aborted', 'canceled'));
          this.sendCancel(id);
        };
        signal.addEventListener('abort', onAbort);
        entry.detachSignal = () => signal.removeEventListener('abort', onAbort);
      }

      this.pending.set(id, entry);

      try {
        this.send({ type: 'req', id, cmd, args: wireArgs });
      } catch (cause) {
        this.settle(id, false, new ProtocolError(messageOf(cause)));
      }
    });
  }

  cancel(id: number): void {
    this.sendCancel(id);
    this.settle(id, false, new ProtocolError('request canceled', 'canceled'));
  }

  releaseChannel(id: number): void {
    this.channels.delete(id);
  }

  ping(): Promise<number> {
    if (this.state !== 'ready') {
      return Promise.reject(new ProtocolError('not connected'));
    }
    const inflight = this.pendingPing;
    if (inflight) {
      return new Promise<number>((resolve, reject) => {
        inflight.waiters.push({ resolve, reject });
      });
    }
    return new Promise<number>((resolve, reject) => {
      const sentAt = this.options.now();
      const timer = setTimeout(() => {
        this.rejectPing('ping timed out');
        this.failWith('ping timed out');
      }, this.options.pingTimeoutMs);
      this.pendingPing = { sentAt, token: sentAt, timer, waiters: [{ resolve, reject }] };
      try {
        this.send({ type: 'ping', t: sentAt });
      } catch (cause) {
        clearTimeout(timer);
        this.pendingPing = null;
        reject(new ProtocolError(messageOf(cause)));
      }
    });
  }

  private rejectPing(reason: string): void {
    const inflight = this.pendingPing;
    if (!inflight) {
      return;
    }
    this.pendingPing = null;
    clearTimeout(inflight.timer);
    for (const waiter of inflight.waiters) {
      waiter.reject(new ProtocolError(reason));
    }
  }

  close(code = 1000, reason = 'client closed'): void {
    if (this.state === 'closed') {
      return;
    }
    this.state = 'closed';
    this.emitStatus();
    this.teardown(reason);
    try {
      this.socket?.close(code, reason);
    } catch {
    }
  }

  private emitStatus(): void {
    for (const listener of [...this.statusListeners]) {
      listener(this.state, this.error ?? undefined);
    }
  }

  private failWith(reason: string): void {
    if (this.state === 'closed') {
      return;
    }
    this.error = reason;
    this.state = 'error';
    this.emitStatus();
    this.teardown(reason);
    try {
      this.socket?.close(1000, 'client error');
    } catch {
    }
  }

  private handleClose(reason: string): void {
    if (this.state === 'closed' || this.state === 'error') {
      return;
    }
    this.error = reason;
    this.state = 'closed';
    this.emitStatus();
    this.teardown(reason);
  }

  private teardown(reason: string): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.rejectPing(reason);
    for (const id of [...this.pending.keys()]) {
      this.settle(id, false, new ProtocolError(reason));
    }
    this.channels.clear();
    this.codec = null;
  }

  private startPingLoop(): void {
    if (this.pingInterval || this.options.pingIntervalMs <= 0) {
      return;
    }
    this.pingInterval = setInterval(() => {
      if (this.state !== 'ready') {
        return;
      }
      void this.ping().catch(() => undefined);
    }, this.options.pingIntervalMs);
  }

  private send(frame: Frame): void {
    if (!this.codec || !this.socket) {
      throw new ProtocolError('not connected');
    }
    this.socket.send(asArrayBuffer(this.codec.encode(frame)));
  }

  private sendCancel(id: number): void {
    this.channels.delete(id);
    if (this.state !== 'ready') {
      return;
    }
    try {
      this.send({ type: 'cancel', id });
    } catch {
    }
  }

  private settle(id: number, ok: boolean, value: unknown): void {
    const entry = this.pending.get(id);
    if (!entry) {
      return;
    }
    this.pending.delete(id);
    if (entry.timer) {
      clearTimeout(entry.timer);
    }
    entry.detachSignal?.();
    if (ok) {
      entry.resolve(value);
      return;
    }
    entry.reject(value instanceof Error ? value : new ProtocolError(String(value), 'remote'));
  }

  private handleFrame(data: unknown): void {
    if (!this.codec) {
      return;
    }
    let frame: Frame;
    try {
      frame = this.codec.decode(data);
    } catch (cause) {
      this.failWith(messageOf(cause));
      return;
    }
    this.dispatch(frame as ServerFrame);
  }

  private dispatch(frame: ServerFrame): void {
    switch (frame.type) {
      case 'res': {
        if (frame.ok) {
          this.settle(frame.id, true, frame.data);
        } else {
          this.channels.delete(frame.id);
          this.settle(frame.id, false, new ProtocolError(frame.error, 'remote'));
        }
        return;
      }
      case 'chan': {
        this.channels.get(frame.id)?.get(frame.arg)?.(frame.payload);
        return;
      }
      case 'event': {
        const listeners = this.events.get(frame.name);
        if (listeners) {
          for (const listener of [...listeners]) {
            listener(frame.payload);
          }
        }
        return;
      }
      case 'ping': {
        try {
          this.send({ type: 'pong', t: frame.t });
        } catch {
        }
        return;
      }
      case 'pong': {
        const inflight = this.pendingPing;
        if (!inflight || inflight.token !== frame.t) {
          return;
        }
        clearTimeout(inflight.timer);
        this.pendingPing = null;
        this.rtt = Math.max(0, this.options.now() - inflight.sentAt);
        for (const waiter of inflight.waiters) {
          waiter.resolve(this.rtt);
        }
        return;
      }
      default:
        return;
    }
  }
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function messageOf(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}

function socketErrorMessage(event: unknown): string {
  if (event && typeof event === 'object' && 'message' in event) {
    const message = (event as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  return 'websocket error';
}

function closeReason(event: unknown): string {
  if (event && typeof event === 'object') {
    const reason = (event as { reason?: unknown }).reason;
    if (typeof reason === 'string' && reason.length > 0) {
      return reason;
    }
    const code = (event as { code?: unknown }).code;
    if (typeof code === 'number' && code !== 1000) {
      return `connection closed (${code})`;
    }
  }
  return 'connection closed';
}
