import { create } from "zustand";

import { kvGet, kvSet } from "@/lib/platform/kv";
import { AGENT_PROVIDER_KEY } from "@/lib/agents/storage-keys";
import { AGENT_PROVIDERS } from "@/lib/agents/provider-meta";

export type NativeAgentProvider = "codex" | "claude" | "opencode" | "cursor";

const NATIVE_AGENT_PROVIDERS: NativeAgentProvider[] = ["codex", "claude", "opencode", "cursor"];

function initialProvider(): NativeAgentProvider {
  const stored = kvGet(AGENT_PROVIDER_KEY) as NativeAgentProvider | null;
  return stored && NATIVE_AGENT_PROVIDERS.includes(stored) ? stored : "codex";
}

export const useAgentProviderStore = create<{
  provider: NativeAgentProvider;
  setProvider: (provider: NativeAgentProvider) => void;
}>((set) => ({
  provider: initialProvider(),
  setProvider: (provider) => {
    kvSet(AGENT_PROVIDER_KEY, provider);
    set({ provider });
  },
}));

export function activeAgentProvider(): NativeAgentProvider {
  return useAgentProviderStore.getState().provider;
}

export interface AgentProviderInstance {
  id: string;
  driver: NativeAgentProvider;
  label: string;
  enabled: boolean;
  isDefault: boolean;
  config: Record<string, unknown>;
}

const AGENT_PROVIDER_INSTANCES_KEY = "l8git.agent-provider-instances";

function defaultInstanceId(driver: NativeAgentProvider): string {
  return `${driver}:default`;
}

function defaultInstances(): AgentProviderInstance[] {
  return NATIVE_AGENT_PROVIDERS.map((driver) => ({
    id: defaultInstanceId(driver),
    driver,
    label: driver,
    enabled: true,
    isDefault: true,
    config: {},
  }));
}

function loadInstances(): AgentProviderInstance[] {
  const raw = kvGet(AGENT_PROVIDER_INSTANCES_KEY);
  if (!raw) return defaultInstances();
  try {
    const stored = JSON.parse(raw) as AgentProviderInstance[];
    if (!Array.isArray(stored) || stored.length === 0) return defaultInstances();
    return stored;
  } catch {
    return defaultInstances();
  }
}

export const useAgentProviderInstanceStore = create<{
  instances: AgentProviderInstance[];
  addInstance: (driver: NativeAgentProvider, label: string, config?: Record<string, unknown>) => AgentProviderInstance;
  setEnabled: (instanceId: string, enabled: boolean) => void;
  removeInstance: (instanceId: string) => void;
}>((set, get) => ({
  instances: loadInstances(),
  addInstance: (driver, label, config = {}) => {
    const instance: AgentProviderInstance = {
      id: `${driver}:${crypto.randomUUID()}`,
      driver,
      label,
      enabled: true,
      isDefault: false,
      config,
    };
    const instances = [...get().instances, instance];
    kvSet(AGENT_PROVIDER_INSTANCES_KEY, JSON.stringify(instances));
    set({ instances });
    return instance;
  },
  setEnabled: (instanceId, enabled) => {
    const instances = get().instances.map((instance) =>
      instance.id === instanceId ? { ...instance, enabled } : instance,
    );
    kvSet(AGENT_PROVIDER_INSTANCES_KEY, JSON.stringify(instances));
    set({ instances });
  },
  removeInstance: (instanceId) => {
    const instances = get().instances.filter(
      (instance) => instance.id !== instanceId || instance.isDefault,
    );
    kvSet(AGENT_PROVIDER_INSTANCES_KEY, JSON.stringify(instances));
    set({ instances });
  },
}));

export function agentProviderInstances(driver: NativeAgentProvider): AgentProviderInstance[] {
  return useAgentProviderInstanceStore.getState().instances.filter((instance) => instance.driver === driver);
}

export function defaultAgentProviderInstance(driver: NativeAgentProvider): AgentProviderInstance | undefined {
  return agentProviderInstances(driver).find((instance) => instance.isDefault);
}

export type ProviderInstanceReadiness = "ready" | "disabled";

export interface ProviderInstanceOption {
  value: string;
  driver: NativeAgentProvider;
  label: string;
  description: string;
  readiness: ProviderInstanceReadiness;
}

export function providerInstanceOptions(
  registry: ReadonlyArray<{ value: NativeAgentProvider; label: string; description: string }> = AGENT_PROVIDERS,
  instances: AgentProviderInstance[] = useAgentProviderInstanceStore.getState().instances,
): ProviderInstanceOption[] {
  return instances.map((instance) => {
    const meta = registry.find((entry) => entry.value === instance.driver);
    return {
      value: instance.id,
      driver: instance.driver,
      label: instance.label || meta?.label || instance.driver,
      description: meta?.description ?? "",
      readiness: instance.enabled ? "ready" : "disabled",
    };
  });
}
