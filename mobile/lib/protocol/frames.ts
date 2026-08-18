import { bytesToUtf8 } from '@noble/ciphers/utils.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

import { PROTOCOL_VERSION, open, seal } from './crypto';

export const GLOBAL_EVENTS = [
  'repo-changed',
  'git-command',
  'git-progress',
  'git-progress-done',
] as const;

export type GlobalEventName = (typeof GLOBAL_EVENTS)[number];

export const CHANNEL_SENTINEL_KEY = '__channel__';

export interface HelloMessage {
  v: number;
  type: 'hello';
  hostId: string;
  eph: string;
  nonce: string;
}

export interface WelcomeMessage {
  v: number;
  type: 'welcome';
  eph: string;
  tag: string;
}

export interface HostInfo {
  name?: string;
  version?: string;
  platform?: string;
}

export interface AuthFrame {
  type: 'auth';
  tag: string;
}

export interface ReadyFrame {
  type: 'ready';
  host: HostInfo;
}

export interface RequestFrame {
  type: 'req';
  id: number;
  cmd: string;
  args: Record<string, unknown>;
}

export interface ResponseOkFrame {
  type: 'res';
  id: number;
  ok: true;
  data: unknown;
}

export interface ResponseErrorFrame {
  type: 'res';
  id: number;
  ok: false;
  error: string;
}

export type ResponseFrame = ResponseOkFrame | ResponseErrorFrame;

export interface ChannelFrame {
  type: 'chan';
  id: number;
  arg: string;
  payload: unknown;
}

export interface EventFrame {
  type: 'event';
  name: string;
  payload: unknown;
}

export interface CancelFrame {
  type: 'cancel';
  id: number;
}

export interface PingFrame {
  type: 'ping';
  t: number;
}

export interface PongFrame {
  type: 'pong';
  t: number;
}

export type ClientFrame = AuthFrame | RequestFrame | CancelFrame | PingFrame | PongFrame;

export type ServerFrame =
  | ReadyFrame
  | ResponseFrame
  | ChannelFrame
  | EventFrame
  | PingFrame
  | PongFrame;

export type Frame = ClientFrame | ServerFrame;

export function isGlobalEventName(name: string): name is GlobalEventName {
  return (GLOBAL_EVENTS as readonly string[]).includes(name);
}

export function encodeHello(message: HelloMessage): string {
  return JSON.stringify(message);
}

export function parseWelcome(raw: string): WelcomeMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('welcome is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('welcome is not an object');
  }
  const value = parsed as Partial<WelcomeMessage> & { error?: unknown };
  if (typeof value.error === 'string') {
    throw new Error(value.error);
  }
  if (value.type !== 'welcome') {
    throw new Error(`expected welcome, received ${String(value.type)}`);
  }
  if (value.v !== PROTOCOL_VERSION) {
    throw new Error(`unsupported protocol version ${String(value.v)}`);
  }
  if (typeof value.eph !== 'string' || typeof value.tag !== 'string') {
    throw new Error('welcome is missing eph or tag');
  }
  return { v: value.v, type: 'welcome', eph: value.eph, tag: value.tag };
}

export function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new Error('expected a binary websocket message');
}

export class FrameCodec {
  private sendCount = 0;
  private recvCount = 0;

  constructor(
    private readonly sendKey: Uint8Array,
    private readonly recvKey: Uint8Array
  ) {}

  get sentFrames(): number {
    return this.sendCount;
  }

  get receivedFrames(): number {
    return this.recvCount;
  }

  encode(frame: Frame): Uint8Array {
    const sealed = seal(this.sendKey, this.sendCount, utf8ToBytes(JSON.stringify(frame)));
    this.sendCount += 1;
    return sealed;
  }

  decode(data: unknown): Frame {
    const plaintext = open(this.recvKey, this.recvCount, toBytes(data));
    this.recvCount += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytesToUtf8(plaintext));
    } catch {
      throw new Error('frame is not valid JSON');
    }
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as Frame).type !== 'string') {
      throw new Error('frame is missing a type');
    }
    return parsed as Frame;
  }
}
