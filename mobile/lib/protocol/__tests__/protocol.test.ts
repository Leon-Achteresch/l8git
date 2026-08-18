import { describe, expect, it } from 'vitest';

import {
  channelArg,
  parsePairing,
  ProtocolClient,
  type HostPairing,
} from '../client';
import {
  deriveSessionKeys,
  fromBase64,
  generateEphemeralKeyPair,
  counterNonce,
  relayToken,
  toBase64,
  toBase64Url,
} from '../crypto';
import { FrameCodec } from '../frames';
import { createHarness } from './harness';

const HOST_ID = 'test-host-id';
const PSK = toBase64(new Uint8Array(32).fill(7));
const OTHER_PSK = toBase64(new Uint8Array(32).fill(9));

const pairing: HostPairing = {
  v: 1,
  hostId: HOST_ID,
  psk: PSK,
  name: 'test-host',
  endpoints: ['ws://127.0.0.1:8484'],
};

describe('crypto primitives', () => {
  it('round-trips base64 for every payload length', () => {
    for (let length = 0; length < 40; length += 1) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        bytes[i] = (i * 37 + length) % 256;
      }
      expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
      expect(Array.from(fromBase64(toBase64Url(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it('encodes the message counter as a 12 byte little-endian nonce', () => {
    expect(Array.from(counterNonce(0))).toEqual(Array(12).fill(0));
    expect(Array.from(counterNonce(1))).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(counterNonce(258))).toEqual([2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('derives matching directional keys on both sides', () => {
    const psk = fromBase64(PSK);
    const client = generateEphemeralKeyPair();
    const server = generateEphemeralKeyPair();
    const a = deriveSessionKeys(client.secretKey, server.publicKey, psk);
    const b = deriveSessionKeys(server.secretKey, client.publicKey, psk);
    expect(toBase64(a.c2s)).toBe(toBase64(b.c2s));
    expect(toBase64(a.s2c)).toBe(toBase64(b.s2c));
    expect(toBase64(a.c2s)).not.toBe(toBase64(a.s2c));
  });

  it('derives a stable relay token', () => {
    expect(relayToken(fromBase64(PSK))).toBe(relayToken(fromBase64(PSK)));
    expect(relayToken(fromBase64(PSK))).not.toBe(relayToken(fromBase64(OTHER_PSK)));
  });
});

describe('FrameCodec', () => {
  const keys = deriveSessionKeys(
    generateEphemeralKeyPair().secretKey,
    generateEphemeralKeyPair().publicKey,
    fromBase64(PSK)
  );

  const pair = () => [
    new FrameCodec(keys.c2s, keys.s2c),
    new FrameCodec(keys.s2c, keys.c2s),
  ] as const;

  it('round-trips frames across the wire', () => {
    const [client, server] = pair();
    const wire = client.encode({ type: 'req', id: 1, cmd: 'repo_status', args: { a: 1 } });
    expect(wire.slice(0, 12)).toEqual(counterNonce(0));
    expect(server.decode(wire)).toEqual({ type: 'req', id: 1, cmd: 'repo_status', args: { a: 1 } });
  });

  it('advances the per-direction counter independently', () => {
    const [client, server] = pair();
    const first = client.encode({ type: 'ping', t: 1 });
    const second = client.encode({ type: 'ping', t: 2 });
    expect(second.slice(0, 12)).toEqual(counterNonce(1));
    expect(server.decode(first)).toEqual({ type: 'ping', t: 1 });
    expect(server.decode(second)).toEqual({ type: 'ping', t: 2 });
    const back = server.encode({ type: 'pong', t: 2 });
    expect(back.slice(0, 12)).toEqual(counterNonce(0));
    expect(client.decode(back)).toEqual({ type: 'pong', t: 2 });
  });

  it('rejects tampered ciphertext', () => {
    const [client, server] = pair();
    const wire = client.encode({ type: 'ping', t: 5 });
    wire[wire.length - 1] ^= 0x01;
    expect(() => server.decode(wire)).toThrow(/authentication failed/);
  });

  it('rejects tampered nonces and replayed frames', () => {
    const [client, server] = pair();
    const wire = client.encode({ type: 'ping', t: 5 });
    const replay = wire.slice();
    expect(server.decode(wire)).toEqual({ type: 'ping', t: 5 });
    expect(() => server.decode(replay)).toThrow(/unexpected frame counter/);
  });

  it('rejects truncated frames', () => {
    const [, server] = pair();
    expect(() => server.decode(new Uint8Array(8))).toThrow(/frame too short/);
  });
});

describe('parsePairing', () => {
  it('accepts a l8gitd pairing payload', () => {
    const parsed = parsePairing(JSON.stringify(pairing));
    expect(parsed.hostId).toBe(HOST_ID);
    expect(parsed.endpoints).toEqual(['ws://127.0.0.1:8484']);
  });

  it('rejects malformed payloads', () => {
    expect(() => parsePairing('nope')).toThrow(/valid JSON/);
    expect(() => parsePairing('{}')).toThrow(/hostId/);
    expect(() => parsePairing(JSON.stringify({ ...pairing, psk: 'AAAA' }))).toThrow(/32 bytes/);
    expect(() => parsePairing(JSON.stringify({ ...pairing, endpoints: [] }))).toThrow(/endpoints/);
  });
});

describe('ProtocolClient against a spec-compliant test server', () => {
  it('completes hello/welcome/auth/ready and answers requests', async () => {
    const { client, server } = createHarness({
      hostId: HOST_ID,
      psk: PSK,
      host: { name: 'zenbook', version: '1.2.3', platform: 'linux' },
      handlers: {
        repo_status: ({ args }) => ({ branch: 'main', repoPath: args.repoPath }),
      },
    });

    const host = await client.connect('ws://mock', pairing);
    expect(host).toEqual({ name: 'zenbook', version: '1.2.3', platform: 'linux' });
    expect(client.status).toBe('ready');
    expect(server.isAuthenticated).toBe(true);

    const status = await client.request('repo_status', { repoPath: '/tmp/repo' });
    expect(status).toEqual({ branch: 'main', repoPath: '/tmp/repo' });
    expect(server.requests[0]).toMatchObject({ id: 1, cmd: 'repo_status' });

    client.close();
  });

  it('aborts the handshake when the welcome tag does not verify', async () => {
    const { client } = createHarness({ hostId: HOST_ID, psk: OTHER_PSK });
    await expect(client.connect('ws://mock', pairing)).rejects.toThrow(/handshake tag mismatch/);
    expect(client.status).toBe('error');
  });

  it('aborts when the server rejects the auth tag', async () => {
    const { client, server } = createHarness({
      hostId: HOST_ID,
      psk: PSK,
      authPsk: OTHER_PSK,
    });
    await expect(client.connect('ws://mock', pairing)).rejects.toThrow();
    expect(server.isAuthenticated).toBe(false);
    expect(server.handshakeErrors).toContain('auth tag mismatch');
    expect(client.status).toBe('error');
  });

  it('aborts when the server does not know the hostId', async () => {
    const { client, server } = createHarness({ hostId: 'someone-else', psk: PSK });
    await expect(client.connect('ws://mock', pairing)).rejects.toThrow();
    expect(server.handshakeErrors).toContain('unknown hostId');
  });

  it('maps channel arguments to callbacks via the sentinel', async () => {
    const seen: unknown[] = [];
    const { client, server } = createHarness({
      hostId: HOST_ID,
      psk: PSK,
      handlers: {
        agent_transport_open: ({ emit }) => {
          emit('onEvent', { sequence: 1, stream: 'json' });
          emit('onEvent', { sequence: 2, stream: 'json' });
          return { id: 42 };
        },
      },
    });

    await client.connect('ws://mock', pairing);
    const handle = await client.request('agent_transport_open', {
      provider: 'codex',
      onEvent: client.channel((message) => seen.push(message)),
    });

    expect(handle).toEqual({ id: 42 });
    expect(server.requests[0].args.onEvent).toEqual({ __channel__: true });
    expect(seen).toEqual([
      { sequence: 1, stream: 'json' },
      { sequence: 2, stream: 'json' },
    ]);

    server.push({ type: 'chan', id: 1, arg: 'onEvent', payload: { sequence: 3 } });
    await tick();
    expect(seen).toHaveLength(3);

    client.releaseChannel(1);
    server.push({ type: 'chan', id: 1, arg: 'onEvent', payload: { sequence: 4 } });
    await tick();
    expect(seen).toHaveLength(3);

    client.close();
  });

  it('accepts standalone channel args built without a client instance', async () => {
    const seen: unknown[] = [];
    const { client } = createHarness({
      hostId: HOST_ID,
      psk: PSK,
      handlers: {
        git_push: ({ emit }) => {
          emit('onProgress', 42);
          return null;
        },
      },
    });
    await client.connect('ws://mock', pairing);
    await client.request('git_push', { onProgress: channelArg<number>((n) => seen.push(n)) });
    expect(seen).toEqual([42]);
    client.close();
  });

  it('rejects with the raw remote error string', async () => {
    const { client } = createHarness({
      hostId: HOST_ID,
      psk: PSK,
      handlers: {
        git_fetch: () => {
          throw new Error('__REMOTE_CANCELED__');
        },
      },
    });
    await client.connect('ws://mock', pairing);
    await expect(client.request('git_fetch', {})).rejects.toThrow('__REMOTE_CANCELED__');
    client.close();
  });

  it('delivers the four global events to subscribers', async () => {
    const received: [string, unknown][] = [];
    const { client, server } = createHarness({ hostId: HOST_ID, psk: PSK });
    await client.connect('ws://mock', pairing);

    const offs = ['repo-changed', 'git-command', 'git-progress', 'git-progress-done'].map((name) =>
      client.on(name, (payload) => received.push([name, payload]))
    );

    server.emitEvent('repo-changed', '/tmp/repo');
    server.emitEvent('git-command', { cmd: 'status' });
    server.emitEvent('git-progress', { pct: 10 });
    server.emitEvent('git-progress-done', { repoPath: '/tmp/repo' });
    await tick();

    expect(received.map(([name]) => name)).toEqual([
      'repo-changed',
      'git-command',
      'git-progress',
      'git-progress-done',
    ]);

    offs.forEach((off) => off());
    server.emitEvent('repo-changed', '/tmp/other');
    await tick();
    expect(received).toHaveLength(4);

    client.close();
  });

  it('sends a cancel frame and rejects the pending request', async () => {
    const settlers: ((value: unknown) => void)[] = [];
    const { client, server } = createHarness({
      hostId: HOST_ID,
      psk: PSK,
      handlers: {
        slow_command: () =>
          new Promise((resolve) => {
            settlers.push(resolve);
          }),
      },
    });
    await client.connect('ws://mock', pairing);

    const inflight = client.request('slow_command', {});
    await tick();
    client.cancel(1);
    await expect(inflight).rejects.toThrow(/canceled/);
    await tick();
    expect(server.canceled).toEqual([1]);
    settlers.forEach((resolve) => resolve(null));
    client.close();
  });

  it('aborts a request through an AbortSignal', async () => {
    const controller = new AbortController();
    const { client, server } = createHarness({
      hostId: HOST_ID,
      psk: PSK,
      handlers: { slow_command: () => new Promise(() => undefined) },
    });
    await client.connect('ws://mock', pairing);
    const inflight = client.request('slow_command', {}, { signal: controller.signal });
    await tick();
    controller.abort();
    await expect(inflight).rejects.toThrow(/aborted/);
    await tick();
    expect(server.canceled).toEqual([1]);
    client.close();
  });

  it('measures round trip latency with ping/pong', async () => {
    const { client } = createHarness({ hostId: HOST_ID, psk: PSK });
    await client.connect('ws://mock', pairing);
    const rtt = await client.ping();
    expect(rtt).toBeGreaterThanOrEqual(0);
    expect(client.latencyMs).toBe(rtt);
    client.close();
  });

  it('fails the connection when a ping is not answered in time', async () => {
    const { client, serverSocket } = createHarness({
      hostId: HOST_ID,
      psk: PSK,
      pingTimeoutMs: 20,
    });
    await client.connect('ws://mock', pairing);
    serverSocket.onmessage = null;
    await expect(client.ping()).rejects.toThrow(/ping timed out/);
    expect(client.status).toBe('error');
    expect(client.lastError).toBe('ping timed out');
  });

  it('rejects pending requests on a clean close', async () => {
    const { client } = createHarness({
      hostId: HOST_ID,
      psk: PSK,
      handlers: { slow_command: () => new Promise(() => undefined) },
    });
    await client.connect('ws://mock', pairing);
    const inflight = client.request('slow_command', {});
    await tick();
    client.close();
    await expect(inflight).rejects.toThrow(/client closed/);
    expect(client.status).toBe('closed');
    await expect(client.request('anything', {})).rejects.toThrow(/not connected/);
  });

  it('reports a status timeline to listeners', async () => {
    const seen: string[] = [];
    const { client } = createHarness({ hostId: HOST_ID, psk: PSK });
    client.onStatus((status) => seen.push(status));
    await client.connect('ws://mock', pairing);
    client.close();
    expect(seen).toEqual(['connecting', 'ready', 'closed']);
  });
});

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}
