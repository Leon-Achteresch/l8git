import type { AgentTokenUsage } from "@/lib/agents/types";

export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite?: number;
  cacheRead?: number;
}

export interface AgentCost {
  inputUsd: number;
  outputUsd: number;
  cacheWriteUsd: number;
  cacheReadUsd: number;
  totalUsd: number;
  cacheSavedUsd: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-fable-5": { input: 10, output: 50 },
  "claude-mythos-5": { input: 10, output: 50 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-opus-4-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "gpt-5.1": { input: 1.25, output: 10, cacheRead: 0.125 },
  "gpt-5": { input: 1.25, output: 10, cacheRead: 0.125 },
  "gpt-5-mini": { input: 0.25, output: 2, cacheRead: 0.025 },
  "gpt-5-nano": { input: 0.05, output: 0.4, cacheRead: 0.005 },
  "o3": { input: 2, output: 8, cacheRead: 0.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10, cacheRead: 0.31 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cacheRead: 0.075 },
  "grok-4": { input: 3, output: 15, cacheRead: 0.75 },
};

export function modelPrice(model: string | null | undefined): ModelPrice | null {
  if (!model) return null;
  const id = model.toLowerCase();
  let best: { key: string; price: ModelPrice } | null = null;
  for (const [key, price] of Object.entries(MODEL_PRICES)) {
    if (!id.includes(key)) continue;
    if (!best || key.length > best.key.length) best = { key, price };
  }
  return best?.price ?? null;
}

export function estimateCost(
  usage: AgentTokenUsage | undefined,
  model: string | null | undefined,
): AgentCost | null {
  const price = modelPrice(model);
  if (!usage || !price) return null;
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  if (!input && !output && !cacheRead && !cacheWrite) return null;

  const cacheWriteRate = price.cacheWrite ?? price.input * 1.25;
  const cacheReadRate = price.cacheRead ?? price.input * 0.1;
  const inputUsd = (input / 1_000_000) * price.input;
  const outputUsd = (output / 1_000_000) * price.output;
  const cacheWriteUsd = (cacheWrite / 1_000_000) * cacheWriteRate;
  const cacheReadUsd = (cacheRead / 1_000_000) * cacheReadRate;

  return {
    inputUsd,
    outputUsd,
    cacheWriteUsd,
    cacheReadUsd,
    totalUsd: inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd,
    cacheSavedUsd: (cacheRead / 1_000_000) * (price.input - cacheReadRate),
  };
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return String(value);
}

export function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function accumulateUsage(
  previous: AgentTokenUsage | undefined,
  delta: Partial<AgentTokenUsage>,
): AgentTokenUsage {
  const inputTokens = (previous?.inputTokens ?? 0) + (delta.inputTokens ?? 0);
  const outputTokens = (previous?.outputTokens ?? 0) + (delta.outputTokens ?? 0);
  const cacheReadTokens = (previous?.cacheReadTokens ?? 0) + (delta.cacheReadTokens ?? 0);
  const cacheWriteTokens = (previous?.cacheWriteTokens ?? 0) + (delta.cacheWriteTokens ?? 0);
  return {
    totalTokens: delta.totalTokens ?? inputTokens + outputTokens,
    modelContextWindow: delta.modelContextWindow ?? previous?.modelContextWindow ?? null,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  };
}
