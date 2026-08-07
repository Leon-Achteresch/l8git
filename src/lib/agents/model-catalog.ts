import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import type { AgentModelOption } from "@/lib/agents/types";

const STORAGE_PREFIX = "l8git.agent-models.";

export function loadModelCatalog(provider: NativeAgentProvider): AgentModelOption[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${provider}`);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is AgentModelOption =>
        typeof entry === "object" && entry !== null && typeof (entry as AgentModelOption).id === "string",
    );
  } catch {
    return [];
  }
}

export function saveModelCatalog(provider: NativeAgentProvider, models: AgentModelOption[]): void {
  if (typeof window === "undefined" || models.length === 0) return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${provider}`, JSON.stringify(models));
  } catch {
    return;
  }
}
