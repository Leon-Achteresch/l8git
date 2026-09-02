import { jiraMcpCommand, type JiraMcpCommand } from "@/lib/jira/jira-mcp";
import { ensureJiraStatus, useJiraStore } from "@/lib/jira/jira-store";

export const JIRA_MCP_NAME = "l8git-jira";

export function jiraThreadKeyFor(sessionId: string): string {
  return `monocode:${sessionId}`;
}

export function jiraEnabled(): boolean {
  const state = useJiraStore.getState();
  return state.enabled && state.status.configured;
}

export async function jiraMcpServer(cwd: string): Promise<JiraMcpCommand | null> {
  if (!useJiraStore.getState().enabled) return null;
  await ensureJiraStatus().catch(() => undefined);
  if (!jiraEnabled()) return null;
  return jiraMcpCommand(cwd).catch(() => null);
}

export function claudeMcpConfig(server: JiraMcpCommand): string {
  return JSON.stringify({
    mcpServers: { [JIRA_MCP_NAME]: { command: server.command, args: server.args } },
  });
}

export function acpMcpServers(server: JiraMcpCommand | null) {
  return server
    ? [{ name: JIRA_MCP_NAME, command: server.command, args: server.args, env: [] }]
    : [];
}

export function codexMcpValue(server: JiraMcpCommand) {
  return {
    command: server.command,
    args: server.args,
    enabled: true,
    startup_timeout_sec: 20,
    tool_timeout_sec: 60,
  };
}

export function codexRegistrationAllowed(): boolean {
  return useJiraStore.getState().registerExternal;
}

export function setActiveJiraSession(cwd: string | undefined, sessionId: string | undefined) {
  if (!cwd) return;
  useJiraStore.getState().setActiveThread(cwd, sessionId ? jiraThreadKeyFor(sessionId) : null);
}
