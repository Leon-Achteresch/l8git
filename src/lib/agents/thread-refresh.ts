import { chatStoreFor } from "@/lib/agents/active-chat-store";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import {
  detectExternalChange,
  type ExternalChangeResult,
  type LocalResumeCursor,
  type NativeSessionMeta,
} from "@/lib/agents/external-change";

export function shouldRefreshForExternalChange(
  local: LocalResumeCursor | null,
  native: NativeSessionMeta,
): ExternalChangeResult {
  return detectExternalChange(local, native);
}

const REFRESH_TTL_MS = 30_000;
const lastRefresh = new Map<string, number>();

export function refreshKey(provider: string, paths: string[], instanceId?: string): string {
  const suffix = instanceId ? `:${instanceId}` : "";
  return `${provider}:${[...paths].sort().join("|")}${suffix}`;
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

export function refreshProviderThreads(
  provider: NativeAgentProvider,
  paths: string[],
  instanceId?: string,
): void {
  if (!paths.length) return;
  const key = refreshKey(provider, paths, instanceId);
  if (!shouldRefresh(key, Date.now())) return;
  void chatStoreFor(provider)
    .getState()
    .loadThreads(paths)
    .catch(() => {
      lastRefresh.delete(key);
    });
}
