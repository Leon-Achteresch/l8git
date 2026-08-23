import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { create } from 'zustand';

import { normalizeHost } from './inbox';

const VIEWER_LOGINS_KEY = 'l8git.viewerLogins.v1';

interface ViewerIdentityState {
  hydrated: boolean;
  logins: Record<string, string>;
  hydrate: () => Promise<void>;
  setLogin: (host: string, login: string | null) => Promise<void>;
}

export const useViewerIdentity = create<ViewerIdentityState>((set, get) => ({
  hydrated: false,
  logins: {},

  hydrate: async () => {
    if (get().hydrated) {
      return;
    }
    const raw = await AsyncStorage.getItem(VIEWER_LOGINS_KEY);
    let logins: Record<string, string> = {};
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [host, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value === 'string' && value.trim()) {
            logins[normalizeHost(host)] = value.trim();
          }
        }
      }
    } catch {
      logins = {};
    }
    set({ logins, hydrated: true });
  },

  setLogin: async (host, login) => {
    const key = normalizeHost(host);
    const next = { ...get().logins };
    if (login && login.trim()) {
      next[key] = login.trim();
    } else {
      delete next[key];
    }
    set({ logins: next });
    await AsyncStorage.setItem(VIEWER_LOGINS_KEY, JSON.stringify(next));
  },
}));

export function useViewerIdentityHydration(): Record<string, string> {
  const logins = useViewerIdentity((state) => state.logins);
  React.useEffect(() => {
    void useViewerIdentity.getState().hydrate();
  }, []);
  return logins;
}

export function viewerLoginForHost(
  logins: Record<string, string>,
  host: string | null | undefined
): string | null {
  const wanted = normalizeHost(host);
  if (!wanted) {
    return null;
  }
  return logins[wanted] ?? null;
}
