import { BARCODE_MCP_SERVER_NAME } from "@/lib/agents/barcode-spec";
import type { AcpMcpServer } from "@/lib/jira/jira-mcp";
import { invoke } from "@/lib/platform/ipc";

export interface RendererMcpCommand {
  command: string;
  args: string[];
}

let cachedCommand: RendererMcpCommand | null = null;

function commandFromBase(base: string[]): RendererMcpCommand | null {
  const [command, ...args] = base;
  return command ? { command, args } : null;
}

/**
 * OpenCode accepts session-scoped MCP servers over ACP. This keeps the
 * renderer available only inside l8git and leaves opencode.json untouched.
 */
export async function rendererAcpMcpServers(): Promise<AcpMcpServer[]> {
  try {
    if (!cachedCommand) {
      cachedCommand = commandFromBase(await invoke<string[]>("renderer_mcp_command"));
    }
    if (!cachedCommand) return [];
    return [{
      name: BARCODE_MCP_SERVER_NAME,
      command: cachedCommand.command,
      args: cachedCommand.args,
      env: [],
    }];
  } catch {
    return [];
  }
}

/** Test seam: forget the memoised executable path. */
export function resetRendererMcpCommandCache(): void {
  cachedCommand = null;
}
