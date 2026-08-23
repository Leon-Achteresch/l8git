import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { setPlatform, type PlatformIpc, type PlatformSecrets } from '@desktop/lib/platform';

import { useAgentBinding } from './agents/binding';
import { getClient, requireActiveClient, requireClient, useConnections } from './connections';
import { channelArg } from './protocol/client';

function targetHostId(): string | null {
  return useAgentBinding.getState().hostId ?? useConnections.getState().activeHostId;
}

const storage: PlatformIpc['storage'] = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
};

function secureKeyFor(key: string): string {
  return `l8git_secret_${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

const secrets: PlatformSecrets = {
  get: async (key) => {
    try {
      return await SecureStore.getItemAsync(secureKeyFor(key));
    } catch {
      return null;
    }
  },
  set: async (key, value) => {
    await SecureStore.setItemAsync(secureKeyFor(key), value);
  },
  delete: async (key) => {
    await SecureStore.deleteItemAsync(secureKeyFor(key)).catch(() => undefined);
  },
};

export const remotePlatform: PlatformIpc = {
  invoke: async <T,>(cmd: string, args: Record<string, unknown> = {}) => {
    const hostId = useAgentBinding.getState().hostId;
    const client = hostId ? requireClient(hostId) : requireActiveClient();
    return client.request<T>(cmd, args);
  },
  channel: <T,>(onMessage: (message: T) => void) => channelArg(onMessage),
  listen: (event, callback) => {
    let boundTo = targetHostId();
    let boundEpoch = useConnections.getState().clientEpoch;
    let off = getClient(boundTo)?.on(event, callback) ?? null;
    const rebind = () => {
      const nextHostId = targetHostId();
      const nextEpoch = useConnections.getState().clientEpoch;
      if (nextHostId === boundTo && nextEpoch === boundEpoch) {
        return;
      }
      boundTo = nextHostId;
      boundEpoch = nextEpoch;
      off?.();
      off = getClient(boundTo)?.on(event, callback) ?? null;
    };
    const unsubscribeConnections = useConnections.subscribe(rebind);
    const unsubscribeBinding = useAgentBinding.subscribe(rebind);
    return () => {
      unsubscribeConnections();
      unsubscribeBinding();
      off?.();
      off = null;
    };
  },
  storage,
  secrets,
};

export function registerRemotePlatform(): PlatformIpc {
  setPlatform(remotePlatform);
  return remotePlatform;
}
