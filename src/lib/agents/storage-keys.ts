import type { NativeAgentProvider } from "@/lib/agents/provider-store";

export const AGENT_PROVIDER_KEY = "l8git.agent-provider";
export const AGENT_COMPOSER_DRAFTS_KEY = "l8git-agent-composer-drafts";
export const AGENT_SESSION_CATALOG_KEY = "l8git-agent-chat";
export const AGENT_MODEL_CATALOG_PREFIX = "l8git.agent-models.";

export const CLAUDE_SESSION_PREFS_KEY = "l8git.claude-session-state.v1";
export const CLAUDE_SETTINGS_KEY = "l8git.claude-settings.v1";
export const OPENCODE_SESSION_PREFS_KEY = "l8git.opencode-session-state.v1";
export const OPENCODE_SETTINGS_KEY = "l8git.opencode-settings.v1";
export const CURSOR_SESSION_PREFS_KEY = "l8git.cursor-session-state.v1";
export const CURSOR_SETTINGS_KEY = "l8git.cursor-settings.v1";
export const CURSOR_TRANSCRIPTS_KEY = "l8git.cursor-transcripts.v1";

const MODEL_CATALOG_PROVIDERS: NativeAgentProvider[] = ["codex", "claude", "opencode", "cursor"];

export function modelCatalogKey(provider: NativeAgentProvider): string {
  return `${AGENT_MODEL_CATALOG_PREFIX}${provider}`;
}

export const AGENT_STORAGE_KEYS: readonly string[] = [
  AGENT_PROVIDER_KEY,
  AGENT_COMPOSER_DRAFTS_KEY,
  AGENT_SESSION_CATALOG_KEY,
  CLAUDE_SESSION_PREFS_KEY,
  CLAUDE_SETTINGS_KEY,
  OPENCODE_SESSION_PREFS_KEY,
  OPENCODE_SETTINGS_KEY,
  CURSOR_SESSION_PREFS_KEY,
  CURSOR_SETTINGS_KEY,
  CURSOR_TRANSCRIPTS_KEY,
  ...MODEL_CATALOG_PROVIDERS.map(modelCatalogKey),
];
