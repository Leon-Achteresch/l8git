import { ClaudeCodeLogo, CodexLogo, CursorLogo, OpenCodeLogo } from "@/components/brand/agent-logos";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";

export const AGENT_PROVIDERS = [
  { value: "codex", label: "Codex", description: "OpenAI CLI", Logo: CodexLogo },
  { value: "claude", label: "Claude Code", description: "Anthropic CLI", Logo: ClaudeCodeLogo },
  { value: "opencode", label: "OpenCode", description: "OpenCode ACP", Logo: OpenCodeLogo },
  { value: "cursor", label: "Cursor CLI", description: "Cursor Agent", Logo: CursorLogo },
] as const satisfies ReadonlyArray<{
  value: NativeAgentProvider;
  label: string;
  description: string;
  Logo: typeof CodexLogo;
}>;

export function agentProviderMeta(provider: NativeAgentProvider) {
  return AGENT_PROVIDERS.find((entry) => entry.value === provider) ?? AGENT_PROVIDERS[0];
}

const CODEX_ONLY_COMMANDS = ["apps", "memories", "import", "fast", "personality", "usage"] as const;
const BACKGROUND_TERMINAL_COMMANDS = ["ps", "stop"] as const;

const CAPABILITY_CENTER_COMMANDS = ["capabilities", "skills", "hooks", "plugins"] as const;

export const UNSUPPORTED_SLASH_COMMANDS: Record<NativeAgentProvider, readonly string[]> = {
  codex: [],
  claude: CODEX_ONLY_COMMANDS,
  opencode: [...CODEX_ONLY_COMMANDS, ...BACKGROUND_TERMINAL_COMMANDS],
  cursor: [
    ...CODEX_ONLY_COMMANDS,
    ...BACKGROUND_TERMINAL_COMMANDS,
    ...CAPABILITY_CENTER_COMMANDS,
  ],
};

export function providerSupportsCapabilityCenter(provider: NativeAgentProvider): boolean {
  return provider !== "cursor";
}

/**
 * How a provider reaches l8git's own tools (currently the Jira readers).
 *
 * - `sdk`: the in-process MCP server Claude Code is launched with
 *   (`agent_transport.rs`, `--mcp-config … "type":"sdk"`) — nothing to install.
 * - `acp`: OpenCode is handed the stdio server per session through ACP's
 *   `mcpServers` parameter — also nothing outside l8git.
 * - `config`: Codex and Cursor only read MCP servers from their own config
 *   files, so l8git registers the stdio server there and removes it again when
 *   the feature is switched off.
 */
export type AgentToolChannel = "sdk" | "acp" | "config";

const APP_TOOL_CHANNELS: Record<NativeAgentProvider, AgentToolChannel> = {
  claude: "sdk",
  opencode: "acp",
  codex: "config",
  cursor: "config",
};

export function agentToolChannel(provider: NativeAgentProvider): AgentToolChannel {
  return APP_TOOL_CHANNELS[provider];
}

/**
 * True when the provider needs an entry in a config file the user owns, rather
 * than being handed the server by l8git directly.
 */
export function providerNeedsToolRegistration(provider: NativeAgentProvider): boolean {
  return agentToolChannel(provider) === "config";
}

export function providerSupportsSlashCommand(
  provider: NativeAgentProvider,
  command: string,
): boolean {
  return !UNSUPPORTED_SLASH_COMMANDS[provider]?.includes(command);
}
