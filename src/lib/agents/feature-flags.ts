import { kvGet, kvSet } from "@/lib/platform/kv";

export const FEATURE_FLAG_CANONICAL_CLAUDE_RUNTIME = "agents.claude.canonicalRuntime";

export type FeatureFlagKey = typeof FEATURE_FLAG_CANONICAL_CLAUDE_RUNTIME;

const DEFAULTS: Record<FeatureFlagKey, boolean> = {
  [FEATURE_FLAG_CANONICAL_CLAUDE_RUNTIME]: false,
};

function storageKey(flag: FeatureFlagKey): string {
  return `l8git.feature-flag.${flag}`;
}

export function isEnabled(flag: FeatureFlagKey): boolean {
  const raw = kvGet(storageKey(flag));
  if (raw === null) return DEFAULTS[flag];
  return raw === "true";
}

export function setEnabled(flag: FeatureFlagKey, enabled: boolean): void {
  kvSet(storageKey(flag), enabled ? "true" : "false");
}

export function resetEnabled(flag: FeatureFlagKey): void {
  kvSet(storageKey(flag), DEFAULTS[flag] ? "true" : "false");
}
