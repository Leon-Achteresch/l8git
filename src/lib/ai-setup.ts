import { useCommitPrefs } from "@/lib/commit-prefs";

export const OLLAMA_DEFAULT_HOST = "http://localhost:11434";
export const OLLAMA_DEFAULT_BASE_URL = `${OLLAMA_DEFAULT_HOST}/v1`;

const OLLAMA_PROBE_TIMEOUT_MS = 1200;

export function isAiConfigured(): boolean {
  const { aiProviderType, aiProviderApiKey, aiProviderBaseUrl } =
    useCommitPrefs.getState();
  if (aiProviderType === "ollama") return true;
  if (aiProviderType === "compatible") {
    return aiProviderBaseUrl.trim().length > 0 && aiProviderApiKey.trim().length > 0;
  }
  if (aiProviderType === "openrouter" && import.meta.env.VITE_OPENROUTER_API_KEY) {
    return true;
  }
  return aiProviderApiKey.trim().length > 0;
}

export async function detectOllamaModels(): Promise<string[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_DEFAULT_HOST}/api/tags`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { models?: { name?: string }[] };
    return (payload.models ?? [])
      .map((m) => m.name?.trim() ?? "")
      .filter((name) => name.length > 0);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
