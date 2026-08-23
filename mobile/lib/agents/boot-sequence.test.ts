import { describe, expect, it, vi } from 'vitest';

import { AGENT_BOOT_ORDER, runAgentBoot, type AgentBootDeps } from './boot-sequence';

function deps(overrides: Partial<AgentBootDeps> = {}) {
  const log: string[] = [];
  let registered = false;
  const base: AgentBootDeps = {
    hasPlatform: () => registered,
    registerPlatform: () => {
      registered = true;
      log.push('setPlatform');
    },
    storageKeys: ['a', 'b'],
    hydrateKv: async (keys) => {
      log.push(`hydrateKv(${keys.join(',')})`);
    },
    loadStores: async () => {
      log.push('loadStores');
    },
    installBridges: () => {
      log.push('installBridges');
    },
    onStep: (step) => log.push(`step:${step}`),
    ...overrides,
  };
  return { log, base };
}

describe('runAgentBoot', () => {
  it('registers the platform before hydrating and loading stores', async () => {
    const { log, base } = deps();
    await runAgentBoot(base);
    expect(log).toEqual([
      'setPlatform',
      'step:register-platform',
      'hydrateKv(a,b)',
      'step:hydrate-kv',
      'loadStores',
      'step:load-stores',
      'installBridges',
      'step:install-bridges',
    ]);
  });

  it('reports steps in the documented order', async () => {
    const steps: string[] = [];
    const { base } = deps({ onStep: (step) => steps.push(step) });
    await runAgentBoot(base);
    expect(steps).toEqual([...AGENT_BOOT_ORDER]);
  });

  it('skips registration when a platform is already installed', async () => {
    const registerPlatform = vi.fn();
    const { log, base } = deps({ hasPlatform: () => true, registerPlatform });
    await runAgentBoot(base);
    expect(registerPlatform).not.toHaveBeenCalled();
    expect(log[0]).toBe('step:register-platform');
  });

  it('aborts when registration does not install a platform', async () => {
    const { base } = deps({ hasPlatform: () => false, registerPlatform: () => undefined });
    await expect(runAgentBoot(base)).rejects.toThrow(/platform ipc was not registered/u);
  });

  it('never loads agent stores when hydration fails', async () => {
    const loadStores = vi.fn(async () => undefined);
    const { base } = deps({
      hydrateKv: async () => {
        throw new Error('storage unavailable');
      },
      loadStores,
    });
    await expect(runAgentBoot(base)).rejects.toThrow('storage unavailable');
    expect(loadStores).not.toHaveBeenCalled();
  });

  it('awaits hydration before the stores read the sync kv cache', async () => {
    const order: string[] = [];
    let hydrated = false;
    const { base } = deps({
      hydrateKv: async () => {
        await Promise.resolve();
        hydrated = true;
        order.push('hydrated');
      },
      loadStores: async () => {
        order.push(hydrated ? 'stores-after-hydration' : 'stores-before-hydration');
      },
    });
    await runAgentBoot(base);
    expect(order).toEqual(['hydrated', 'stores-after-hydration']);
  });
});
