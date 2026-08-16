import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";

import {
  AI_PROVIDER_DEFAULT_MODELS,
  useCommitPrefs,
  type AiProviderType,
} from "@/lib/commit-prefs";
import i18n from "@/lib/i18n";
import { useRepoPrefs } from "@/lib/repo-prefs";
import type { AiFeature } from "@/lib/ai/prompts";

export type AiErrorKind = "noApiKey" | "network" | "aborted" | "empty" | "unknown";

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly feature?: AiFeature;
  readonly cause?: unknown;

  constructor(kind: AiErrorKind, message: string, feature?: AiFeature, cause?: unknown) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
    this.feature = feature;
    this.cause = cause;
  }
}

export interface AiProviderConfig {
  type: AiProviderType;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export function buildLanguageModel(
  type: AiProviderType,
  apiKey: string,
  model: string,
  baseUrl: string,
): LanguageModel {
  const resolvedModel = model.trim() || AI_PROVIDER_DEFAULT_MODELS[type];

  switch (type) {
    case "openai":
      return createOpenAI({ apiKey })(resolvedModel);

    case "anthropic":
      return createAnthropic({ apiKey })(resolvedModel);

    case "google":
      return createGoogleGenerativeAI({ apiKey })(resolvedModel);

    case "openrouter":
      return createOpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: apiKey || import.meta.env.VITE_OPENROUTER_API_KEY,
      })(resolvedModel);

    case "ollama":
      return createOpenAI({
        baseURL: baseUrl.trim() || "http://localhost:11434/v1",
        apiKey: "ollama",
      })(resolvedModel);

    case "compatible":
      return createOpenAI({ baseURL: baseUrl.trim(), apiKey })(resolvedModel);
  }
}

export function getAiProviderConfig(): AiProviderConfig {
  const { aiProviderType, aiProviderApiKey, aiProviderModel, aiProviderBaseUrl } =
    useCommitPrefs.getState();
  return {
    type: aiProviderType,
    apiKey: aiProviderApiKey,
    model: aiProviderModel,
    baseUrl: aiProviderBaseUrl,
  };
}

export function hasAiCredentials(config: AiProviderConfig = getAiProviderConfig()): boolean {
  if (config.type === "ollama") return true;
  if (config.apiKey.trim().length > 0) return true;
  return config.type === "openrouter" && !!import.meta.env.VITE_OPENROUTER_API_KEY;
}

export function resolveLanguageModel(feature?: AiFeature): LanguageModel {
  const config = getAiProviderConfig();
  if (!hasAiCredentials(config)) {
    throw new AiError("noApiKey", i18n.t("errors.aiNoApiKey"), feature);
  }
  return buildLanguageModel(config.type, config.apiKey, config.model, config.baseUrl);
}

export function resolveAiLanguage(repoPath?: string): string {
  const global = useCommitPrefs.getState().aiOutputLanguage;
  const repo = repoPath ? useRepoPrefs.getState().getAiOutputLanguage(repoPath) : undefined;
  return (repo ?? global).trim() || "English";
}

export function truncateForPrompt(text: string, maxChars: number): string {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : trimmed.slice(0, maxChars);
}

function isAbortLike(value: unknown): boolean {
  if (typeof DOMException !== "undefined" && value instanceof DOMException) {
    return value.name === "AbortError";
  }
  if (value instanceof Error) {
    if (value.name === "AbortError" || value.name === "TimeoutError") return true;
    return /\babort(ed)?\b|cancell?ed/i.test(value.message);
  }
  return false;
}

function isNetworkLike(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value ?? "");
  if (value instanceof TypeError && /fetch/i.test(message)) return true;
  return /fetch failed|failed to fetch|load failed|network|socket|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|connection (refused|reset)/i.test(
    message,
  );
}

export function toAiError(cause: unknown, feature?: AiFeature, signal?: AbortSignal): AiError {
  if (cause instanceof AiError) return cause;
  if (signal?.aborted || isAbortLike(cause)) {
    return new AiError("aborted", i18n.t("errors.aiAborted"), feature, cause);
  }
  if (isNetworkLike(cause)) {
    return new AiError("network", i18n.t("errors.aiNetwork"), feature, cause);
  }
  const message = cause instanceof Error ? cause.message : String(cause ?? "");
  return new AiError("unknown", message || i18n.t("errors.aiNoResponse"), feature, cause);
}

export interface GenerateAiTextOptions {
  feature: AiFeature;
  prompt: string;
  system?: string;
  hint?: string;
  signal?: AbortSignal;
  model?: LanguageModel;
}

export async function generateAiText(options: GenerateAiTextOptions): Promise<string> {
  const { feature, prompt, system, hint, signal } = options;

  if (signal?.aborted) {
    throw new AiError("aborted", i18n.t("errors.aiAborted"), feature);
  }

  const model = options.model ?? resolveLanguageModel(feature);
  const trimmedHint = hint?.trim() ?? "";
  const finalPrompt = trimmedHint
    ? `${prompt}\n\nAdditional instruction from the user for this attempt — follow it strictly:\n${trimmedHint}`
    : prompt;

  try {
    const result = await generateText({
      model,
      ...(system ? { system } : {}),
      prompt: finalPrompt,
      ...(signal ? { abortSignal: signal } : {}),
    });
    const text = result.text ?? "";
    if (!text.trim()) {
      throw new AiError("empty", i18n.t("errors.aiNoResponse"), feature);
    }
    return text;
  } catch (cause) {
    throw toAiError(cause, feature, signal);
  }
}
