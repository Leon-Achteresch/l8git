import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
const secure = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => void storage.set(key, value),
    removeItem: async (key: string) => void storage.delete(key),
  },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void secure.set(key, value),
  deleteItemAsync: async (key: string) => void secure.delete(key),
}));

vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
}));

const { LAN_ONLY_MESSAGE, isLanEndpoint, lanEndpoints } = await import('../endpoints');
const { secureKeyFor, useConnections } = await import('../connections');
const { toBase64 } = await import('../protocol/crypto');

const PSK = toBase64(new Uint8Array(32).fill(7));
const RELAY_URL = 'wss://relay.example';

beforeEach(() => {
  storage.clear();
  secure.clear();
  useConnections.setState({ hydrated: false, hosts: [], runtime: {}, activeHostId: null });
});

describe('LAN endpoints', () => {
  it('keeps direct ws:// addresses and drops relay URLs', () => {
    expect(isLanEndpoint('ws://192.168.1.20:8484')).toBe(true);
    expect(isLanEndpoint('ws://[fe80::1]:8484/ws')).toBe(true);
    expect(isLanEndpoint(RELAY_URL)).toBe(false);
    expect(isLanEndpoint('ws://relay.example/client/abc')).toBe(false);
    expect(lanEndpoints(['ws://10.0.0.2:8484', RELAY_URL])).toEqual(['ws://10.0.0.2:8484']);
  });
});

describe('legacy relay data', () => {
  it('pairs a QR payload that still carries a relay URL over LAN only', async () => {
    const payload = JSON.stringify({
      v: 1,
      hostId: 'host-a',
      psk: PSK,
      name: 'Desk',
      endpoints: ['ws://192.168.1.20:8484', RELAY_URL],
    });
    const meta = await useConnections.getState().addHost(payload);
    expect(meta.endpoints).toEqual(['ws://192.168.1.20:8484']);
    expect(JSON.parse(secure.get(secureKeyFor('host-a'))!).endpoints).toEqual([
      'ws://192.168.1.20:8484',
    ]);
  });

  it('rejects a relay-only QR payload with a re-pair message', async () => {
    const payload = JSON.stringify({ v: 1, hostId: 'host-b', psk: PSK, endpoints: [RELAY_URL] });
    await expect(useConnections.getState().addHost(payload)).rejects.toThrow(LAN_ONLY_MESSAGE);
    expect(secure.size).toBe(0);
  });

  it('keeps a saved relay-only host and marks it unreachable without retrying', async () => {
    const hostId = 'host-c';
    const secureKey = secureKeyFor(hostId);
    secure.set(secureKey, JSON.stringify({ v: 1, hostId, psk: PSK, endpoints: [RELAY_URL] }));
    storage.set(
      'l8git.hosts.v1',
      JSON.stringify([
        {
          hostId,
          name: 'Old relay host',
          endpoints: [RELAY_URL],
          secureKey,
          addedAt: 1,
          lastConnectedAt: null,
          autoConnect: true,
        },
      ])
    );

    await useConnections.getState().hydrate();
    await useConnections.getState().connect(hostId);

    const state = useConnections.getState();
    expect(state.hosts.map((host) => host.hostId)).toEqual([hostId]);
    expect(state.runtime[hostId].status).toBe('error');
    expect(state.runtime[hostId].lastError).toBe(LAN_ONLY_MESSAGE);
    expect(state.runtime[hostId].nextRetryAt).toBeNull();
  });
});
