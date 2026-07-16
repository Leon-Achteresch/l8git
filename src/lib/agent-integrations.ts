import type { ComponentType } from "react";

import {
  ClaudeCodeLogo,
  CodexLogo,
  CopilotLogo,
  CursorLogo,
  GeminiLogo,
  OpenCodeLogo,
} from "@/components/brand/agent-logos";
import { useTerminalStore, type TerminalTab } from "@/lib/terminal-store";

export type AgentIntegration = {
  id: string;
  label: string;
  command: string;
  icon: ComponentType<{ className?: string }>;
};

export const AGENT_INTEGRATIONS: AgentIntegration[] = [
  { id: "claude", label: "Claude Code", command: "claude", icon: ClaudeCodeLogo },
  { id: "codex", label: "Codex", command: "codex", icon: CodexLogo },
  { id: "gemini", label: "Gemini CLI", command: "gemini", icon: GeminiLogo },
  { id: "cursor", label: "Cursor CLI", command: "agent", icon: CursorLogo },
  { id: "opencode", label: "OpenCode", command: "opencode", icon: OpenCodeLogo },
  { id: "copilot", label: "Copilot CLI", command: "copilot", icon: CopilotLogo },
];

export function integrationOf(tab: TerminalTab): AgentIntegration | undefined {
  const cmd = tab.command?.trim();
  if (!cmd) return undefined;
  return AGENT_INTEGRATIONS.find(
    (i) => cmd === i.command || cmd.startsWith(`${i.command} `),
  );
}

export function agentTabs(tabs: TerminalTab[]): TerminalTab[] {
  return tabs.filter((t) => integrationOf(t) !== undefined);
}

export function launchAgent(path: string, integration: AgentIntegration): string {
  const s = useTerminalStore.getState();
  const existing = (s.tabsByPath[path] ?? []).find(
    (t) => integrationOf(t)?.id === integration.id,
  );
  if (existing) {
    s.setActiveTab(path, existing.id);
    s.setVisible(path, true);
    return existing.id;
  }
  return s.openTab(path, integration.label, integration.command);
}
