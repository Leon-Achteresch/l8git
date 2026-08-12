import { chatStoreFor } from "@/lib/agents/active-chat-store";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";

const REFRESH_TTL_MS = 30_000;
const lastRefresh = new Map<string, number>();

export function refreshKey(provider: string, paths: string[]): string {
  return `${provider}:${[...paths].sort().join("|")}`;
}

export function shouldRefresh(
  key: string,
  now: number,
  history: Map<string, number> = lastRefresh,
  ttlMs: number = REFRESH_TTL_MS,
): boolean {
  const previous = history.get(key);
  if (previous !== undefined && now - previous < ttlMs) return false;
  history.set(key, now);
  return true;
}

export function refreshProviderThreads(provider: NativeAgentProvider, paths: string[]): void {
  if (!paths.length) return;
  if (!shouldRefresh(refreshKey(provider, paths), Date.now())) return;
  void chatStoreFor(provider)
    .getState()
    .loadThreads(paths)
    .catch(() => {
      lastRefresh.delete(refreshKey(provider, paths));
    });
}
