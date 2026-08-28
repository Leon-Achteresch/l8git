/**
 * Keeps the three out-of-process providers in step with the Jira gate.
 *
 * Registration and gating are deliberately separate concerns:
 *
 *  * **Registration** answers "could Jira ever help here?" — the feature is on
 *    and credentials exist. It is coarse and rarely changes.
 *  * **The gate** answers "does it help right now?" — pinned tickets and the
 *    search switch. It lives in the policy file, which the spawned server
 *    re-reads per call, so pinning a ticket takes effect inside a session that
 *    is already running.
 *
 * Splitting them is what lets OpenCode work at all: ACP fixes `mcpServers` when
 * the session is created, so the server has to be there before the first ticket
 * is pinned. The tokens are still only spent once the gate opens, because an
 * empty `tools/list` costs nothing.
 */

import { codexSessionManager } from "@/lib/agents/session-manager";
import {
  CODEX_CONFIG_KEY_PATH,
  acpMcpServer,
  codexMcpConfig,
  jiraMcpCommand,
  type AcpMcpServer,
} from "@/lib/jira/jira-mcp";
import { ensureJiraStatus, useJiraStore } from "@/lib/jira/jira-store";
import { invoke } from "@/lib/platform/ipc";

const NO_SERVERS: AcpMcpServer[] = [];

/** True while the spawned server could serve something, now or after a pin. */
export function jiraServerUseful(state: {
  enabled: boolean;
  status: { configured: boolean };
}): boolean {
  return state.enabled && state.status.configured;
}

/** MCP servers to hand OpenCode when it opens a session for `cwd`. */
export async function jiraAcpMcpServers(cwd: string): Promise<AcpMcpServer[]> {
  const state = useJiraStore.getState();
  if (!state.enabled) return NO_SERVERS;
  await ensureJiraStatus();
  if (!jiraServerUseful(useJiraStore.getState())) return NO_SERVERS;
  const command = await jiraMcpCommand(cwd);
  return command ? [acpMcpServer(command)] : NO_SERVERS;
}

async function syncCodex(register: boolean, path: string): Promise<void> {
  const command = register ? await jiraMcpCommand(path) : null;
  if (register && !command) return;
  const client = await codexSessionManager.controlClient();
  try {
    await client.writeConfigValue(
      CODEX_CONFIG_KEY_PATH,
      command ? codexMcpConfig(command) : null,
      command ? "upsert" : "replace",
    );
    await client.reloadMcpServers();
  } finally {
    codexSessionManager.releaseControl();
  }
}

let lastSync = "";

/**
 * Writes (or removes) the Codex and Cursor entries. Both live in config files
 * the user owns, so this runs only while the "register externally" switch is
 * on, and removes the entry again the moment it goes off.
 *
 * Failures are swallowed on purpose: a Codex CLI that is not installed, or a
 * `~/.cursor/mcp.json` the app may not write, must not break the agents view.
 */
export async function syncJiraExternalRegistration(path: string): Promise<void> {
  const state = useJiraStore.getState();
  if (state.enabled) await ensureJiraStatus();
  const current = useJiraStore.getState();
  const register = current.registerExternal && jiraServerUseful(current);
  const fingerprint = `${register ? "on" : "off"}:${path}`;
  if (fingerprint === lastSync) return;
  lastSync = fingerprint;

  const results = await Promise.allSettled([
    syncCodex(register, path),
    invoke("jira_sync_cursor_mcp", { enabled: register, repo: path }),
  ]);
  // A provider that is not installed simply has nothing to register; retry the
  // next time something changes rather than pinning a stale fingerprint.
  if (results.some((result) => result.status === "rejected")) lastSync = "";
}

/** Test seam: forget the memoised fingerprint. */
export function resetJiraSyncCache(): void {
  lastSync = "";
}
