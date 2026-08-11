import {
  ClaudeCodeLogo,
  CodexLogo,
  CopilotLogo,
  CursorLogo,
  GeminiLogo,
  OpenCodeLogo,
} from "@/components/brand/agent-logos";
import type { AgentProviderDefinition } from "@/lib/agents/types";

export const AGENT_PROVIDERS: AgentProviderDefinition[] = [
  {
    id: "codex",
    label: "Codex",
    description: "Native Chat-Integration über Codex App Server",
    command: "codex",
    icon: CodexLogo,
    surface: "chat",
    capabilities: { history: true, approvals: true, models: true, images: true, tools: true },
  },
  {
    id: "claude",
    label: "Claude Code",
    description: "Native Chat-Integration über Claude Code SDK-Stream",
    command: "claude",
    icon: ClaudeCodeLogo,
    surface: "chat",
    capabilities: { history: true, approvals: true, models: true, images: true, tools: true },
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    description: "Terminal-Integration",
    command: "gemini",
    icon: GeminiLogo,
    surface: "terminal",
    capabilities: { history: false, approvals: false, models: false, images: false, tools: false },
  },
  {
    id: "cursor",
    label: "Cursor CLI",
    description: "Native Chat-Integration über cursor-agent stream-json",
    command: "cursor-agent",
    icon: CursorLogo,
    surface: "chat",
    capabilities: { history: true, approvals: false, models: true, images: false, tools: true },
  },
  {
    id: "opencode",
    label: "OpenCode",
    description: "Native Chat-Integration über OpenCode ACP",
    command: "opencode",
    icon: OpenCodeLogo,
    surface: "chat",
    capabilities: { history: true, approvals: true, models: true, images: true, tools: true },
  },
  {
    id: "copilot",
    label: "Copilot CLI",
    description: "Terminal-Integration",
    command: "copilot",
    icon: CopilotLogo,
    surface: "terminal",
    capabilities: { history: false, approvals: false, models: false, images: false, tools: false },
  },
];

export function agentProvider(id: string): AgentProviderDefinition | undefined {
  return AGENT_PROVIDERS.find((provider) => provider.id === id);
}
