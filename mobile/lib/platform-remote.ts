import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { setPlatform, type PlatformIpc, type PlatformSecrets } from '@desktop/lib/platform';

import { getActiveClient, requireActiveClient, useConnections } from './connections';
import { channelArg } from './protocol/client';

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
  invoke: <T,>(cmd: string, args: Record<string, unknown> = {}) =>
    requireActiveClient().request<T>(cmd, args),
  channel: <T,>(onMessage: (message: T) => void) => channelArg(onMessage),
  listen: (event, callback) => {
    let off = getActiveClient()?.on(event, callback) ?? null;
    let boundTo = useConnections.getState().activeHostId;
    let boundEpoch = useConnections.getState().clientEpoch;
    const unsubscribe = useConnections.subscribe((state) => {
      if (state.activeHostId === boundTo && state.clientEpoch === boundEpoch) {
        return;
      }
      boundTo = state.activeHostId;
      boundEpoch = state.clientEpoch;
      off?.();
      off = getActiveClient()?.on(event, callback) ?? null;
    });
    return () => {
      unsubscribe();
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
