/**
 * Registering the Jira tools with the CLIs that cannot use l8git's in-process
 * MCP server.
 *
 * Claude Code is launched with `--mcp-config … "type":"sdk"`, so its tools are
 * answered inside the app and nothing has to be registered. The other three
 * have no such channel, so l8git re-executes its own binary as a stdio MCP
 * server (`jira_mcp.rs`) and hands each CLI a way to reach it:
 *
 * | Provider | Channel | Touches user config? |
 * |---|---|---|
 * | Claude Code | in-process SDK server | no |
 * | OpenCode | `mcpServers` on ACP `session/*` | no |
 * | Codex | `mcp_servers.<key>` via the app-server config RPC | yes, `~/.codex/config.toml` |
 * | Cursor | `~/.cursor/mcp.json` | yes |
 *
 * The two that write config do so only while the user leaves the "register with
 * Codex and Cursor" switch on, and the entry is removed again when it goes off,
 * when Jira is disabled, or when the credentials are deleted. Both entries are
 * also visible to the user's own Codex/Cursor sessions — that is the reason the
 * switch exists at all.
 */

import { invoke } from "@/lib/platform/ipc";

export const JIRA_MCP_SERVER_KEY = "l8git-jira";
export const CODEX_CONFIG_KEY_PATH = `mcp_servers.${JIRA_MCP_SERVER_KEY}`;

export interface JiraMcpCommand {
  command: string;
  args: string[];
}

/**
 * `[executable, subcommand]` from the backend, plus the repository the spawned
 * server should gate on.
 */
export function jiraMcpCommandFor(base: string[], repo: string): JiraMcpCommand | null {
  const [command, ...args] = base;
  if (!command) return null;
  return { command, args: repo ? [...args, "--repo", repo] : [...args] };
}

let cachedBase: string[] | null = null;

async function mcpCommandBase(): Promise<string[] | null> {
  if (cachedBase) return cachedBase;
  try {
    const base = await invoke<string[]>("jira_mcp_command");
    if (!Array.isArray(base) || base.length === 0) return null;
    cachedBase = base;
    return base;
  } catch {
    return null;
  }
}

export async function jiraMcpCommand(repo: string): Promise<JiraMcpCommand | null> {
  const base = await mcpCommandBase();
  return base ? jiraMcpCommandFor(base, repo) : null;
}

/** Test seam: forget the memoised executable path. */
export function resetJiraMcpCommandCache(): void {
  cachedBase = null;
}

/** ACP `session/*` shape for a stdio MCP server. */
export interface AcpMcpServer {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
}

export function acpMcpServer(command: JiraMcpCommand): AcpMcpServer {
  return { name: JIRA_MCP_SERVER_KEY, command: command.command, args: command.args, env: [] };
}

/** Codex `mcp_servers.<key>` table. */
export function codexMcpConfig(command: JiraMcpCommand): Record<string, unknown> {
  return {
    command: command.command,
    args: command.args,
    enabled: true,
    startup_timeout_sec: 20,
    tool_timeout_sec: 60,
  };
}
