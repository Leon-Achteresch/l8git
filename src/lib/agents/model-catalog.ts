import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import type { AgentModelOption } from "@/lib/agents/types";
import { kvGet, kvSet } from "@/lib/platform/kv";
import { modelCatalogKey } from "@/lib/agents/storage-keys";

function isModelOption(entry: unknown): entry is AgentModelOption {
  return typeof entry === "object" && entry !== null && typeof (entry as AgentModelOption).id === "string";
}

function instanceCatalogKey(provider: NativeAgentProvider, instanceId?: string): string {
  const base = modelCatalogKey(provider);
  return instanceId ? `${base}.${instanceId}` : base;
}

export function loadModelCatalog(provider: NativeAgentProvider, instanceId?: string): AgentModelOption[] {
  try {
    const raw = kvGet(instanceCatalogKey(provider, instanceId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isModelOption);
  } catch {
    return [];
  }
}

export function saveModelCatalog(
  provider: NativeAgentProvider,
  models: AgentModelOption[],
  instanceId?: string,
): void {
  if (models.length === 0 && !instanceId) return;
  try {
    kvSet(instanceCatalogKey(provider, instanceId), JSON.stringify(models));
  } catch {
    return;
  }
}

export type ModelCatalogSource = "live" | "cache" | "defaults";

export interface ResolvedModelCatalog {
  models: AgentModelOption[];
  source: ModelCatalogSource;
}

export function mergeModelCatalog(
  staticDefaults: AgentModelOption[],
  live: AgentModelOption[],
): AgentModelOption[] {
  if (live.length === 0) return [];
  const byId = new Map(staticDefaults.map((model) => [model.id, model]));
  for (const model of live) byId.set(model.id, model);
  return live.map((model) => byId.get(model.id) ?? model);
}

export type ModelSwitchApply = "immediate" | "nextTurn" | "reject";

export interface ModelSwitchPlan {
  apply: ModelSwitchApply;
  reason?: string;
}

export function planModelSwitch(params: {
  current: string;
  target: string;
  turnActive: boolean;
  catalog: ReadonlyArray<{ id: string }>;
}): ModelSwitchPlan {
  const { current, target, turnActive, catalog } = params;
  if (!catalog.some((model) => model.id === target)) {
    return { apply: "reject", reason: "unknown-model" };
  }
  if (target === current) {
    return { apply: "immediate" };
  }
  if (turnActive) {
    return { apply: "nextTurn", reason: "turn-active" };
  }
  return { apply: "immediate" };
}

export interface ModelThinkingCapabilities {
  supportsEffort: boolean;
  effortLevels: string[];
  supportsThinking: boolean;
  thinkingBudgetRange?: { min: number; max: number };
}

export interface NormalizedThinkingConfig {
  effort?: string;
  thinking?: { enabled: boolean; budgetTokens?: number };
}

export function normalizeThinkingConfig(
  model: ModelThinkingCapabilities,
  input: { effort?: string; thinking?: { enabled: boolean; budgetTokens?: number } },
): NormalizedThinkingConfig {
  const result: NormalizedThinkingConfig = {};

  if (model.supportsEffort && model.effortLevels.length > 0) {
    const effort =
      input.effort && model.effortLevels.includes(input.effort) ? input.effort : model.effortLevels[0];
    result.effort = effort;
  }

  if (model.supportsThinking) {
    const enabled = input.thinking?.enabled ?? false;
    let budgetTokens = input.thinking?.budgetTokens;
    if (budgetTokens !== undefined && model.thinkingBudgetRange) {
      const { min, max } = model.thinkingBudgetRange;
      budgetTokens = Math.min(max, Math.max(min, budgetTokens));
    }
    result.thinking = budgetTokens !== undefined ? { enabled, budgetTokens } : { enabled };
  }

  return result;
}

export type BackendPresetId = "anthropic" | "bedrock" | "vertex" | "custom-router";

export interface BackendPreset {
  id: BackendPresetId;
  label: string;
  requiredEnvKeys: string[];
  env: Record<string, string>;
  modelIdFormat: string;
}

export const CLAUDE_BACKEND_PRESETS: readonly BackendPreset[] = [
  {
    id: "anthropic",
    label: "Anthropic (Direct API)",
    requiredEnvKeys: ["ANTHROPIC_API_KEY"],
    env: {},
    modelIdFormat: "claude-<family>-<version>",
  },
  {
    id: "bedrock",
    label: "AWS Bedrock",
    requiredEnvKeys: ["AWS_REGION", "ANTHROPIC_BEDROCK_MODEL_ID"],
    env: { CLAUDE_CODE_USE_BEDROCK: "1" },
    modelIdFormat: "anthropic.claude-<family>-<version>-v1:0",
  },
  {
    id: "vertex",
    label: "Google Vertex AI",
    requiredEnvKeys: ["ANTHROPIC_VERTEX_PROJECT_ID", "CLOUD_ML_REGION"],
    env: { CLAUDE_CODE_USE_VERTEX: "1" },
    modelIdFormat: "claude-<family>-<version>@<region>",
  },
  {
    id: "custom-router",
    label: "Custom Router / Proxy",
    requiredEnvKeys: ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"],
    env: {},
    modelIdFormat: "<router-defined>",
  },
];

export interface BackendPresetResult {
  env: Record<string, string>;
  warnings: string[];
}

export function applyBackendPreset(
  instanceConfig: Record<string, string | undefined>,
  preset: BackendPreset,
): BackendPresetResult {
  const env: Record<string, string> = { ...preset.env };
  const warnings: string[] = [];
  for (const key of preset.requiredEnvKeys) {
    const value = instanceConfig[key];
    if (value === undefined || value.trim() === "") {
      warnings.push(`missing required key: ${key}`);
      continue;
    }
    env[key] = value;
  }
  return { env, warnings };
}

export function resolveModelCatalog(params: {
  provider: NativeAgentProvider;
  instanceId?: string;
  staticDefaults: AgentModelOption[];
  live: AgentModelOption[] | null;
}): ResolvedModelCatalog {
  const { provider, instanceId, staticDefaults, live } = params;
  if (live !== null) {
    const merged = mergeModelCatalog(staticDefaults, live);
    saveModelCatalog(provider, merged, instanceId);
    return { models: merged, source: "live" };
  }
  const cached = loadModelCatalog(provider, instanceId);
  if (cached.length > 0) return { models: cached, source: "cache" };
  return { models: staticDefaults, source: "defaults" };
}
