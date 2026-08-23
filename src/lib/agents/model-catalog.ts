import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import type { AgentModelOption } from "@/lib/agents/types";
import { kvGet, kvSet } from "@/lib/platform/kv";
import { modelCatalogKey } from "@/lib/agents/storage-keys";

export function loadModelCatalog(provider: NativeAgentProvider): AgentModelOption[] {
  try {
    const raw = kvGet(modelCatalogKey(provider));
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
  if (models.length === 0) return;
  try {
    kvSet(modelCatalogKey(provider), JSON.stringify(models));
  } catch {
    return;
  }
}
