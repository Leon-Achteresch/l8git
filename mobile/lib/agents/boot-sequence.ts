export type AgentBootStep =
  | 'register-platform'
  | 'hydrate-kv'
  | 'load-stores'
  | 'install-bridges';

export const AGENT_BOOT_ORDER: readonly AgentBootStep[] = [
  'register-platform',
  'hydrate-kv',
  'load-stores',
  'install-bridges',
];

export interface AgentBootDeps {
  hasPlatform: () => boolean;
  registerPlatform: () => void;
  storageKeys: readonly string[];
  hydrateKv: (keys: readonly string[]) => Promise<void>;
  loadStores: () => Promise<void>;
  installBridges: () => void | Promise<void>;
  onStep?: (step: AgentBootStep) => void;
}

export async function runAgentBoot(deps: AgentBootDeps): Promise<void> {
  if (!deps.hasPlatform()) {
    deps.registerPlatform();
  }
  if (!deps.hasPlatform()) {
    throw new Error('agent boot aborted: platform ipc was not registered');
  }
  deps.onStep?.('register-platform');

  await deps.hydrateKv(deps.storageKeys);
  deps.onStep?.('hydrate-kv');

  await deps.loadStores();
  deps.onStep?.('load-stores');

  await deps.installBridges();
  deps.onStep?.('install-bridges');
}
