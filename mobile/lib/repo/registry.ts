import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

const STORAGE_KEY = 'l8git.repoPaths.v1';

const EMPTY: readonly string[] = [];

function normalize(path: string): string {
  const trimmed = path.trim().replace(/\\/g, '/');
  if (trimmed.length > 1 && trimmed.endsWith('/')) {
    return trimmed.replace(/\/+$/, '');
  }
  return trimmed;
}

function parse(raw: string | null): Record<string, string[]> {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string[]> = {};
    for (const [hostId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        out[hostId] = value.filter((item): item is string => typeof item === 'string');
      }
    }
    return out;
  } catch {
    return {};
  }
}

interface RegistryState {
  hydrated: boolean;
  pathsByHost: Record<string, string[]>;
  hydrate: () => Promise<void>;
  addPath: (hostId: string, path: string) => Promise<void>;
  removePath: (hostId: string, path: string) => Promise<void>;
  mergePaths: (hostId: string, paths: readonly string[]) => void;
}

export const useRepoRegistry = create<RegistryState>((set, get) => {
  const persist = async (pathsByHost: Record<string, string[]>) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pathsByHost)).catch(() => undefined);
  };

  return {
    hydrated: false,
    pathsByHost: {},

    hydrate: async () => {
      if (get().hydrated) {
        return;
      }
      const raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
      set({ pathsByHost: parse(raw), hydrated: true });
    },

    addPath: async (hostId, path) => {
      const value = normalize(path);
      if (!value) {
        return;
      }
      const current = get().pathsByHost[hostId] ?? [];
      if (current.includes(value)) {
        return;
      }
      const next = { ...get().pathsByHost, [hostId]: [...current, value].sort() };
      set({ pathsByHost: next });
      await persist(next);
    },

    removePath: async (hostId, path) => {
      const current = get().pathsByHost[hostId] ?? [];
      const remaining = current.filter((item) => item !== path);
      if (remaining.length === current.length) {
        return;
      }
      const next = { ...get().pathsByHost, [hostId]: remaining };
      set({ pathsByHost: next });
      await persist(next);
    },

    mergePaths: (hostId, paths) => {
      const current = get().pathsByHost[hostId] ?? [];
      const merged = new Set(current);
      for (const path of paths) {
        const value = normalize(path);
        if (value) {
          merged.add(value);
        }
      }
      if (merged.size === current.length) {
        return;
      }
      const next = { ...get().pathsByHost, [hostId]: [...merged].sort() };
      set({ pathsByHost: next });
      void persist(next);
    },
  };
});

export function useRepoRegistryHydration(): boolean {
  const hydrated = useRepoRegistry((state) => state.hydrated);
  React.useEffect(() => {
    void useRepoRegistry.getState().hydrate();
  }, []);
  return hydrated;
}

export function useHostRepoPaths(hostId: string | null | undefined): readonly string[] {
  return useRepoRegistry(
    useShallow((state) => (hostId ? (state.pathsByHost[hostId] ?? EMPTY) : EMPTY))
  );
}

export function knownRepoPaths(): string[] {
  const { pathsByHost } = useRepoRegistry.getState();
  return [...new Set(Object.values(pathsByHost).flat())];
}
