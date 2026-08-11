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
