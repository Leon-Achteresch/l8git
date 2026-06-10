import { invoke } from "@tauri-apps/api/core";

/**
 * Thin wrappers around the OS keyring via Tauri IPC.
 * Used for secrets that must not sit in localStorage (e.g. AI provider API keys).
 */

export async function secureSet(key: string, value: string): Promise<void> {
  await invoke("secret_set", { key, value });
}

export async function secureGet(key: string): Promise<string | null> {
  return invoke<string | null>("secret_get", { key });
}

export async function secureDelete(key: string): Promise<void> {
  await invoke("secret_delete", { key });
}

export const AI_KEY_KEYRING_KEY = "ai_provider_api_key";
