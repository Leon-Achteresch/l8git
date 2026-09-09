import { BARCODE_MCP_SERVER_NAME, BARCODE_TOOL } from "@/lib/agents/barcode-spec";
import { CHART_TOOL } from "@/lib/agents/chart-spec";
import type { AcpMcpServer } from "@/lib/jira/jira-mcp";
import { invoke } from "@/lib/platform/ipc";

export interface HostMcpToolDriverSupport {
  claude: boolean;
  cursor: boolean;
  opencode: boolean;
  codex: boolean;
}

export interface HostMcpTool {
  name: string;
  description: string;
  driverSupport: HostMcpToolDriverSupport;
  inputSchema: unknown;
}

const RENDERER_DRIVER_SUPPORT: HostMcpToolDriverSupport = {
  claude: true,
  cursor: true,
  opencode: true,
  codex: true,
};

/**
 * Eine Registry statt drei: `renderer_mcp.rs` bedient dieselben Tool-Namen
 * über den stdio-Server, damit Namen und Schemas nicht auseinanderlaufen.
 */
export const HOST_MCP_TOOLS: readonly HostMcpTool[] = [
  {
    name: BARCODE_TOOL.name,
    description: BARCODE_TOOL.description,
    driverSupport: RENDERER_DRIVER_SUPPORT,
    inputSchema: BARCODE_TOOL.inputSchema,
  },
  {
    name: CHART_TOOL.name,
    description: CHART_TOOL.description,
    driverSupport: RENDERER_DRIVER_SUPPORT,
    inputSchema: CHART_TOOL.inputSchema,
  },
];

export function findHostMcpTool(name: string): HostMcpTool | undefined {
  return HOST_MCP_TOOLS.find((tool) => tool.name === name);
}

/** Wirft explizit statt ein unbekanntes Tool still zu ignorieren. */
export function requireHostMcpTool(name: string): HostMcpTool {
  const tool = findHostMcpTool(name);
  if (!tool) throw new Error(`Unbekanntes Renderer-Tool: ${name}`);
  return tool;
}

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
