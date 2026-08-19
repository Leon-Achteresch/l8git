import { utf8ToBytes } from '@noble/hashes/utils.js';

import {
  PROTOCOL_VERSION,
  authTag,
  decodeFixed,
  decodePsk,
  deriveSessionKeys,
  generateEphemeralKeyPair,
  handshakeTag,
  toBase64,
  verifyTag,
} from '../crypto';
import { FrameCodec, type Frame, type HostInfo } from '../frames';
import { ProtocolClient, type SocketFactory, type SocketLike } from '../client';

export class MockSocket implements SocketLike {
  binaryType = 'blob';
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  peer: MockSocket | null = null;
  closed = false;

  send(data: string | ArrayBuffer | ArrayBufferView): void {
    if (this.closed) {
      throw new Error('socket is closed');
    }
    const peer = this.peer;
    if (!peer) {
      return;
    }
    const payload = typeof data === 'string' ? data : copyBuffer(data);
    setTimeout(() => {
      if (!peer.closed) {
        peer.onmessage?.({ data: payload });
      }
    }, 0);
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    setTimeout(() => this.onclose?.({ code, reason }), 0);
    const peer = this.peer;
    if (peer && !peer.closed) {
      peer.closed = true;
      setTimeout(() => peer.onclose?.({ code, reason }), 0);
    }
  }
}

function copyBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  const view =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

export function createSocketPair(): [MockSocket, MockSocket] {
  const a = new MockSocket();
  const b = new MockSocket();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

export interface HandlerContext {
  id: number;
  args: Record<string, unknown>;
  emit(arg: string, payload: unknown): void;
}

export type TestHandler = (ctx: HandlerContext) => unknown | Promise<unknown>;

export interface TestServerOptions {
  psk: string;
  authPsk?: string;
  hostId: string;
  host?: HostInfo;
  handlers?: Record<string, TestHandler>;
  binaryWelcome?: boolean;
}

export class TestServer {
  readonly canceled: number[] = [];
  readonly requests: { id: number; cmd: string; args: Record<string, unknown> }[] = [];
  readonly handshakeErrors: string[] = [];
  private codec: FrameCodec | null = null;
  private socket: MockSocket | null = null;
  private clientEph: Uint8Array | null = null;
  private serverEph: Uint8Array | null = null;
  private helloNonce: Uint8Array | null = null;
  private authenticated = false;

  constructor(private readonly options: TestServerOptions) {}

  get isAuthenticated(): boolean {
    return this.authenticated;
  }

  attach(socket: MockSocket): void {
    this.socket = socket;
    socket.onmessage = (event) => {
      try {
        this.handle(event.data);
      } catch (cause) {
        this.handshakeErrors.push(cause instanceof Error ? cause.message : String(cause));
        socket.close(1008, cause instanceof Error ? cause.message : 'handshake failed');
      }
    };
  }

  emitEvent(name: string, payload: unknown): void {
    this.push({ type: 'event', name, payload });
  }

  push(frame: Frame): void {
    if (!this.codec || !this.socket) {
      throw new Error('server session is not established');
    }
    if (this.socket.closed) {
      return;
    }
    this.socket.send(copyBuffer(this.codec.encode(frame)));
  }

  private handle(data: unknown): void {
    if (!this.codec) {
      this.handleHello(data);
      return;
    }
    const frame = this.codec.decode(data);
    if (!this.authenticated) {
      this.handleAuth(frame);
      return;
    }
    void this.handleFrame(frame);
  }

  private handleHello(data: unknown): void {
    if (typeof data !== 'string') {
      throw new Error('hello must be a text message');
    }
    const parsed = JSON.parse(data) as {
      v?: number;
      type?: string;
      hostId?: string;
      eph?: string;
      nonce?: string;
    };
    if (parsed.type !== 'hello' || parsed.v !== PROTOCOL_VERSION) {
      throw new Error('invalid hello');
    }
    if (parsed.hostId !== this.options.hostId) {
      throw new Error('unknown hostId');
    }
    const psk = decodePsk(this.options.psk);
    const clientEph = decodeFixed(String(parsed.eph), 32, 'client ephemeral key');
    const nonce = decodeFixed(String(parsed.nonce), 16, 'hello nonce');
    const keys = generateEphemeralKeyPair();
    this.clientEph = clientEph;
    this.serverEph = keys.publicKey;
    this.helloNonce = nonce;

    const welcome = JSON.stringify({
      v: PROTOCOL_VERSION,
      type: 'welcome',
      eph: toBase64(keys.publicKey),
      tag: toBase64(handshakeTag(psk, clientEph, keys.publicKey, nonce)),
    });
    this.socket?.send(
      this.options.binaryWelcome ? copyBuffer(utf8ToBytes(welcome)) : welcome
    );

    const session = deriveSessionKeys(keys.secretKey, clientEph, psk);
    this.codec = new FrameCodec(session.s2c, session.c2s);
  }

  private handleAuth(frame: Frame): void {
    if (frame.type !== 'auth') {
      throw new Error('first encrypted frame must be auth');
    }
    const psk = decodePsk(this.options.authPsk ?? this.options.psk);
    const expected = authTag(psk, this.clientEph!, this.serverEph!, this.helloNonce!);
    if (!verifyTag(expected, frame.tag)) {
      throw new Error('auth tag mismatch');
    }
    this.authenticated = true;
    this.push({ type: 'ready', host: this.options.host ?? { name: 'test-host' } });
  }

  private async handleFrame(frame: Frame): Promise<void> {
    if (frame.type === 'ping') {
      this.push({ type: 'pong', t: frame.t });
      return;
    }
    if (frame.type === 'cancel') {
      this.canceled.push(frame.id);
      return;
    }
    if (frame.type !== 'req') {
      return;
    }
    this.requests.push({ id: frame.id, cmd: frame.cmd, args: frame.args });
    const handler = this.options.handlers?.[frame.cmd];
    if (!handler) {
      this.push({ type: 'res', id: frame.id, ok: false, error: `unknown command ${frame.cmd}` });
      return;
    }
    try {
      const data = await handler({
        id: frame.id,
        args: frame.args,
        emit: (arg, payload) => this.push({ type: 'chan', id: frame.id, arg, payload }),
      });
      this.push({ type: 'res', id: frame.id, ok: true, data: data ?? null });
    } catch (cause) {
      this.push({
        type: 'res',
        id: frame.id,
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
}

export interface PairedHarness {
  client: ProtocolClient;
  server: TestServer;
  clientSocket: MockSocket;
  serverSocket: MockSocket;
}

export function createHarness(
  options: TestServerOptions & { pingIntervalMs?: number; pingTimeoutMs?: number }
): PairedHarness {
  const [clientSocket, serverSocket] = createSocketPair();
  const server = new TestServer(options);
  server.attach(serverSocket);
  const socketFactory: SocketFactory = () => {
    setTimeout(() => clientSocket.onopen?.({}), 0);
    return clientSocket;
  };
  const client = new ProtocolClient({
    socketFactory,
    pingIntervalMs: options.pingIntervalMs ?? 0,
    pingTimeoutMs: options.pingTimeoutMs ?? 10_000,
  });
  return { client, server, clientSocket, serverSocket };
}
