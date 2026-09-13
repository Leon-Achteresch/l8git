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

export interface TurnBudgetConfig {
  maxTurns?: number;
  maxBudgetUsd?: number;
  outputSchema?: string;
}

export interface TurnBudgetCapability {
  status: "supported" | "unsupported";
  reason?: string;
}

export interface TurnBudgetValidation {
  maxTurns: TurnBudgetCapability;
  maxBudgetUsd: TurnBudgetCapability;
  outputSchema: TurnBudgetCapability;
  valid: boolean;
}

function isValidJsonSchema(schema: string): boolean {
  try {
    const parsed: unknown = JSON.parse(schema);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

export function validateTurnBudget(
  config: TurnBudgetConfig,
  capabilities: { structuredOutput: boolean; maxTurns: boolean; maxBudget: boolean },
): TurnBudgetValidation {
  const maxTurns: TurnBudgetCapability =
    config.maxTurns === undefined
      ? { status: "supported" }
      : !capabilities.maxTurns
        ? { status: "unsupported", reason: "model/CLI does not support max-turns" }
        : !Number.isSafeInteger(config.maxTurns) || config.maxTurns < 1
          ? { status: "unsupported", reason: "maxTurns must be at least 1" }
          : { status: "supported" };

  const maxBudgetUsd: TurnBudgetCapability =
    config.maxBudgetUsd === undefined
      ? { status: "supported" }
      : !capabilities.maxBudget
        ? { status: "unsupported", reason: "model/CLI does not support a cost budget" }
        : !Number.isFinite(config.maxBudgetUsd) || config.maxBudgetUsd <= 0
          ? { status: "unsupported", reason: "maxBudgetUsd must be greater than 0" }
          : { status: "supported" };

  const outputSchema: TurnBudgetCapability =
    config.outputSchema === undefined
      ? { status: "supported" }
      : !capabilities.structuredOutput
        ? { status: "unsupported", reason: "model/CLI does not support structured output" }
        : !isValidJsonSchema(config.outputSchema)
          ? { status: "unsupported", reason: "invalid JSON schema" }
          : { status: "supported" };

  return {
    maxTurns,
    maxBudgetUsd,
    outputSchema,
    valid:
      maxTurns.status === "supported" &&
      maxBudgetUsd.status === "supported" &&
      outputSchema.status === "supported",
  };
}

export interface FastModeCapability {
  status: "supported" | "unsupported";
  reason?: string;
}

export function fastModeCapability(
  model: Pick<AgentModelOption, "serviceTiers"> | undefined,
  version: string | null,
): FastModeCapability {
  if (!model) {
    return { status: "unsupported", reason: "unknown model" };
  }
  if (!version) {
    return { status: "unsupported", reason: "CLI version unknown" };
  }
  const hasFastTier = model.serviceTiers.some((tier) => tier.id === "fast");
  if (!hasFastTier) {
    return { status: "unsupported", reason: "model does not advertise a fast service tier" };
  }
  return { status: "supported" };
}

export type ResolvedModelId =
  | { kind: "alias"; alias: string; id: string }
  | { kind: "known"; id: string }
  | { kind: "custom"; id: string };

const MODEL_ALIASES: Record<string, string> = {
  opus: "claude-opus-4",
  sonnet: "claude-sonnet-4",
  haiku: "claude-haiku-4",
};

export function resolveModelAlias(
  input: string,
  catalog: ReadonlyArray<{ id: string }>,
): ResolvedModelId {
  const aliasTarget = Object.prototype.hasOwnProperty.call(MODEL_ALIASES, input)
    ? MODEL_ALIASES[input]
    : undefined;
  if (aliasTarget) {
    return { kind: "alias", alias: input, id: aliasTarget };
  }
  if (catalog.some((model) => model.id === input)) {
    return { kind: "known", id: input };
  }
  return { kind: "custom", id: input };
}

export interface ModelFallbackInfo {
  requested: string;
  used: string;
  isFallback: boolean;
  fallbackReason?: "explicit" | "provider_refusal";
}

export function resolveModelFallback(params: {
  requested: string;
  configuredFallback?: string;
  providerRefusalFallback?: string;
}): ModelFallbackInfo {
  const { requested, configuredFallback, providerRefusalFallback } = params;
  if (providerRefusalFallback && providerRefusalFallback !== requested) {
    return {
      requested,
      used: providerRefusalFallback,
      isFallback: true,
      fallbackReason: "provider_refusal",
    };
  }
  if (configuredFallback && configuredFallback !== requested) {
    return { requested, used: configuredFallback, isFallback: true, fallbackReason: "explicit" };
  }
  return { requested, used: requested, isFallback: false };
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
