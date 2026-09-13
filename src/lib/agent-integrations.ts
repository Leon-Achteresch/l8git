import { invoke } from "@tauri-apps/api/core";
import type { ComponentType } from "react";
import { create } from "zustand";

import { AGENT_PROVIDERS } from "@/lib/agents/provider-registry";
import { useTerminalStore, type TerminalTab } from "@/lib/terminal-store";

export type AgentIntegration = {
  id: string;
  label: string;
  command: string;
  icon: ComponentType<{ className?: string }>;
  surface: "chat" | "terminal";
};

export const AGENT_INTEGRATIONS: AgentIntegration[] = AGENT_PROVIDERS.map(
  ({ id, label, command, icon, surface }) => ({ id, label, command, icon, surface }),
);

export function integrationOf(tab: TerminalTab): AgentIntegration | undefined {
  const cmd = tab.command?.trim();
  if (!cmd) return undefined;
  return AGENT_INTEGRATIONS.find(
    (i) => cmd === i.command || cmd.startsWith(`${i.command} `),
  );
}

export function agentTabs(tabs: TerminalTab[]): TerminalTab[] {
  return tabs.filter((t) => integrationOf(t)?.surface === "terminal");
}

export function launchAgent(
  path: string,
  integration: AgentIntegration,
  opts?: { newInstance?: boolean },
): string {
  if (integration.surface !== "terminal") {
    throw new Error(`${integration.label} verwendet die native Chat-Oberfläche.`);
  }
  const s = useTerminalStore.getState();
  const own = (s.tabsByPath[path] ?? []).filter(
    (t) => integrationOf(t)?.id === integration.id,
  );
  if (opts?.newInstance || own.length === 0) {
    return s.openTab(path, integration.label, integration.command);
  }
  // Focus the agent's tab; repeated clicks cycle through its instances.
  const activeIdx = own.findIndex((t) => t.id === s.activeByPath[path]);
  const next =
    activeIdx >= 0 && s.visibleByPath[path]
      ? own[(activeIdx + 1) % own.length]
      : own[0];
  s.setActiveTab(path, next.id);
  s.setVisible(path, true);
  return next.id;
}

/** Integration ids whose CLI exists on this machine; null = not detected yet. */
export const useInstalledAgents = create<{ installed: Set<string> | null }>()(
  () => ({ installed: null }),
);

let detectStarted = false;
export function detectInstalledAgents(): void {
  if (detectStarted) return;
  detectStarted = true;
  const bin = (i: AgentIntegration) => i.command.split(" ")[0];
  invoke<string[]>("detect_clis", {
    commands: AGENT_INTEGRATIONS.map(bin),
  })
    .then((found) => {
      const set = new Set(found);
      useInstalledAgents.setState({
        installed: new Set(
          AGENT_INTEGRATIONS.filter((i) => set.has(bin(i))).map((i) => i.id),
        ),
      });
    })
    .catch(() => {
      detectStarted = false; // retry on next dock mount
    });
}

export type ProviderReadinessStatus =
  | "notInstalled"
  | "outdated"
  | "notAuthenticated"
  | "ready"
  | "unknown";

export interface ProviderReadinessInput {
  binaryFound: boolean | null;
  versionStatus: "ok" | "outdated" | "unknown" | null;
  authenticated: boolean | null;
}

export function deriveProviderReadiness(input: ProviderReadinessInput): ProviderReadinessStatus {
  if (input.binaryFound === false) return "notInstalled";
  if (input.versionStatus === "outdated") return "outdated";
  if (input.authenticated === false) return "notAuthenticated";
  if (input.binaryFound === true && input.versionStatus === "ok" && input.authenticated === true) {
    return "ready";
  }
  return "unknown";
}

interface ClaudeVersionStatusResponse {
  status: "ok" | "outdated" | "unknown";
  version?: string;
}

interface ClaudeAuthStatusResponse {
  authenticated?: boolean;
  isAuthenticated?: boolean;
  loggedIn?: boolean;
}

function readAuthenticated(value: unknown): boolean | null {
  if (!value || typeof value !== "object") return null;
  const response = value as ClaudeAuthStatusResponse;
  if (typeof response.authenticated === "boolean") return response.authenticated;
  if (typeof response.isAuthenticated === "boolean") return response.isAuthenticated;
  if (typeof response.loggedIn === "boolean") return response.loggedIn;
  return null;
}

export const useProviderReadiness = create<{
  byId: Record<string, ProviderReadinessStatus>;
}>()(() => ({ byId: {} }));

export async function refreshProviderReadiness(integration: AgentIntegration): Promise<ProviderReadinessStatus> {
  const bin = integration.command.split(" ")[0];
  const installed = useInstalledAgents.getState().installed;
  const binaryFound = installed ? installed.has(integration.id) : null;

  if (bin !== "claude") {
    const status = deriveProviderReadiness({ binaryFound, versionStatus: null, authenticated: null });
    useProviderReadiness.setState((state) => ({ byId: { ...state.byId, [integration.id]: status } }));
    return status;
  }

  const [versionResult, authResult] = await Promise.allSettled([
    invoke<ClaudeVersionStatusResponse>("claude_version_status"),
    invoke<unknown>("claude_auth_status"),
  ]);

  const versionStatus =
    versionResult.status === "fulfilled" ? versionResult.value.status : "unknown";
  const authenticated =
    authResult.status === "fulfilled" ? readAuthenticated(authResult.value) : null;

  const status = deriveProviderReadiness({ binaryFound, versionStatus, authenticated });
  useProviderReadiness.setState((state) => ({ byId: { ...state.byId, [integration.id]: status } }));
  return status;
}
