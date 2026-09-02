export type TokenUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export type ModelPrice = {
  input: number;
  output: number;
  cacheWrite?: number;
  cacheRead?: number;
};

export type ApiCost = {
  inputUsd: number;
  outputUsd: number;
  cacheWriteUsd: number;
  cacheReadUsd: number;
  totalUsd: number;
  cacheSavedUsd: number;
};

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
  "claude-opus-4-1": { input: 15, output: 75 },
  "claude-opus-4-0": { input: 15, output: 75 },
  "claude-sonnet-4-0": { input: 3, output: 15 },
  opus: { input: 5, output: 25 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
  "gpt-5.1": { input: 1.25, output: 10, cacheRead: 0.125 },
  "gpt-5": { input: 1.25, output: 10, cacheRead: 0.125 },
  "gpt-5-mini": { input: 0.25, output: 2, cacheRead: 0.025 },
  "gpt-5-nano": { input: 0.05, output: 0.4, cacheRead: 0.005 },
  "gpt-5-codex": { input: 1.25, output: 10, cacheRead: 0.125 },
  o3: { input: 2, output: 8, cacheRead: 0.5 },
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
  usage: TokenUsage | undefined,
  model: string | null | undefined,
): ApiCost | null {
  const price = modelPrice(model);
  if (!usage || !price) return null;
  if (!usage.input && !usage.output && !usage.cacheRead && !usage.cacheWrite) return null;
  const cacheWriteRate = price.cacheWrite ?? price.input * 1.25;
  const cacheReadRate = price.cacheRead ?? price.input * 0.1;
  const inputUsd = (usage.input / 1_000_000) * price.input;
  const outputUsd = (usage.output / 1_000_000) * price.output;
  const cacheWriteUsd = (usage.cacheWrite / 1_000_000) * cacheWriteRate;
  const cacheReadUsd = (usage.cacheRead / 1_000_000) * cacheReadRate;
  return {
    inputUsd,
    outputUsd,
    cacheWriteUsd,
    cacheReadUsd,
    totalUsd: inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd,
    cacheSavedUsd: (usage.cacheRead / 1_000_000) * (price.input - cacheReadRate),
  };
}

export function addUsage(a: TokenUsage | undefined, b: Partial<TokenUsage>): TokenUsage {
  return {
    input: (a?.input ?? 0) + (b.input ?? 0),
    output: (a?.output ?? 0) + (b.output ?? 0),
    cacheRead: (a?.cacheRead ?? 0) + (b.cacheRead ?? 0),
    cacheWrite: (a?.cacheWrite ?? 0) + (b.cacheWrite ?? 0),
  };
}

export function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}
