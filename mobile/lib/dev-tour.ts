import * as React from 'react';
import { router } from 'expo-router';

const STOPS = ['/', '/repos', '/dashboard', '/agents', '/settings'] as const;
const DWELL_MS = 12_000;

export function useDevTour(): void {
  React.useEffect(() => {
    if (process.env.EXPO_PUBLIC_SHOT_TOUR !== '1') {
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % STOPS.length;
      try {
        router.navigate(STOPS[i] as never);
      } catch {
        /* ignore */
      }
    }, DWELL_MS);
    return () => clearInterval(id);
  }, []);
}
