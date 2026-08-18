import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformIpc } from '@desktop/lib/platform';

const backing = new Map<string, string>();

function mockPlatform(): PlatformIpc {
  return {
    invoke: async () => {
      throw new Error('invoke is not available in this test');
    },
    channel: () => ({}),
    listen: () => () => undefined,
    storage: {
      getItem: async (name) => backing.get(name) ?? null,
      setItem: async (name, value) => {
        backing.set(name, value);
      },
      removeItem: async (name) => {
        backing.delete(name);
      },
    },
    secrets: {
      get: async () => null,
      set: async () => undefined,
      delete: async () => undefined,
    },
  };
}

async function install() {
  const platform = await import('@desktop/lib/platform');
  platform.setPlatform(mockPlatform());
  return platform;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  backing.clear();
});

describe('agent kv hydration', () => {

  it('exposes async storage values to the sync kv cache only after hydration', async () => {
    backing.set('l8git.agent-provider', 'claude');
    await install();
    const kv = await import('@desktop/lib/platform/kv');
    const keys = await import('@desktop/lib/agents/storage-keys');

    expect(kv.kvGet('l8git.agent-provider')).toBeNull();
    await kv.hydrateKv(keys.AGENT_STORAGE_KEYS);
    expect(kv.kvGet('l8git.agent-provider')).toBe('claude');
  });

  it('initialises the provider store from storage when it loads after hydration', async () => {
    backing.set('l8git.agent-provider', 'opencode');
    await install();
    const kv = await import('@desktop/lib/platform/kv');
    const keys = await import('@desktop/lib/agents/storage-keys');
    await kv.hydrateKv(keys.AGENT_STORAGE_KEYS);

    const { useAgentProviderStore } = await import('@desktop/lib/agents/provider-store');
    expect(useAgentProviderStore.getState().provider).toBe('opencode');
  });

  it('falls back to the default provider when the store loads before hydration', async () => {
    backing.set('l8git.agent-provider', 'opencode');
    await install();

    const { useAgentProviderStore } = await import('@desktop/lib/agents/provider-store');
    expect(useAgentProviderStore.getState().provider).toBe('codex');
  });

  it('persists provider changes back through the platform storage', async () => {
    await install();
    const kv = await import('@desktop/lib/platform/kv');
    const keys = await import('@desktop/lib/agents/storage-keys');
    await kv.hydrateKv(keys.AGENT_STORAGE_KEYS);

    const { useAgentProviderStore } = await import('@desktop/lib/agents/provider-store');
    useAgentProviderStore.getState().setProvider('cursor');
    await Promise.resolve();
    expect(backing.get('l8git.agent-provider')).toBe('cursor');
  });
});
