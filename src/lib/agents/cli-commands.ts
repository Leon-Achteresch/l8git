import type { CapabilityInventory } from "@/lib/agents/capability-hub";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import { claudeCapabilitySnapshot } from "@/lib/agents/providers/claude/chat-store";
import { openCodeCapabilitySnapshot } from "@/lib/agents/providers/opencode/chat-store";
import type { AgentCapability } from "@/lib/agents/types";
import { invoke } from "@/lib/platform/ipc";
import { mergeCliCommands, type AgentCliCommand } from "@/lib/agents/slash-commands";

export type CliCommandScope = "chat" | "terminal" | "sdk-internal";

export interface CliCommandSpec {
  name: string;
  scope: CliCommandScope;
  interactive: boolean;
  minVersion?: string;
  conflictsWith?: readonly string[];
  ticket: string;
}

export const CLAUDE_CLI_COMMAND_INVENTORY: readonly CliCommandSpec[] = [
  { name: "new", scope: "chat", interactive: false, ticket: "CLI-01" },
  { name: "clear", scope: "chat", interactive: false, ticket: "CLI-01" },
  { name: "compact", scope: "chat", interactive: false, ticket: "CLI-01" },
  { name: "model", scope: "chat", interactive: false, ticket: "CLI-01" },
  { name: "permissions", scope: "chat", interactive: false, ticket: "CLI-01" },
  { name: "mcp", scope: "chat", interactive: true, ticket: "CLI-01" },
  { name: "hooks", scope: "chat", interactive: false, ticket: "CLI-01" },
  { name: "plugins", scope: "chat", interactive: false, ticket: "CLI-01" },
  { name: "logout", scope: "chat", interactive: false, conflictsWith: ["mcp"], ticket: "CLI-01" },
  { name: "ps", scope: "terminal", interactive: false, minVersion: "1.0.0", ticket: "CLI-01" },
  { name: "stop", scope: "terminal", interactive: false, minVersion: "1.0.0", ticket: "CLI-01" },
];

function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const partsB = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i += 1) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function cliCommandCapability(name: string, currentVersion: string | null): AgentCapability {
  const spec = CLAUDE_CLI_COMMAND_INVENTORY.find((entry) => entry.name === name);
  if (!spec) return { status: "unavailable", reason: "not present in the versioned CLI inventory" };
  if (spec.minVersion) {
    if (!currentVersion) {
      return { status: "unsupported", reason: "CLI version unknown", minVersion: spec.minVersion };
    }
    if (compareVersions(currentVersion, spec.minVersion) < 0) {
      return {
        status: "unsupported",
        reason: `requires Claude CLI >= ${spec.minVersion}`,
        minVersion: spec.minVersion,
      };
    }
  }
  return { status: "supported" };
}

export interface TerminalHandoffInput {
  binaryPath: string;
  cwd: string;
  sessionId?: string;
  configDir?: string;
  debug?: boolean;
  secretEnv?: Record<string, string>;
}

export interface TerminalHandoffCommand {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function buildTerminalHandoffCommand(input: TerminalHandoffInput): TerminalHandoffCommand {
  const { binaryPath, cwd, sessionId, configDir, debug, secretEnv } = input;
  if (!binaryPath || !binaryPath.trim()) {
    throw new Error("binaryPath is required");
  }
  if (!cwd || !cwd.trim()) {
    throw new Error("cwd is required");
  }
  const args: string[] = [];
  if (sessionId !== undefined) {
    args.push("--resume", sessionId);
  }
  if (debug) {
    args.push("--debug");
  }
  const env: Record<string, string> = { ...secretEnv };
  if (configDir !== undefined) {
    env.CLAUDE_CONFIG_DIR = configDir;
  }
  return { command: binaryPath, args, env };
}

export type ClaudeSettingSource = "user" | "project" | "local" | "managed";

export interface ClaudeLaunchArgsInput {
  systemPrompt?: string;
  appendSystemPrompt?: string;
  settingSources: ClaudeSettingSource[];
  trusted: boolean;
}

export interface ClaudeLaunchArgsResult {
  args: string[];
  warnings: string[];
}

export function buildClaudeLaunchArgs(input: ClaudeLaunchArgsInput): ClaudeLaunchArgsResult {
  const { systemPrompt, appendSystemPrompt, settingSources, trusted } = input;
  if (systemPrompt !== undefined && appendSystemPrompt !== undefined) {
    throw new Error("systemPrompt and appendSystemPrompt cannot be set at the same time");
  }
  const args: string[] = [];
  const warnings: string[] = [];

  if (systemPrompt !== undefined) {
    args.push("--system-prompt", systemPrompt);
  } else if (appendSystemPrompt !== undefined) {
    args.push("--append-system-prompt", appendSystemPrompt);
  }

  const allowedSources = settingSources.filter((source) => {
    if ((source === "project" || source === "local") && !trusted) {
      warnings.push(`setting source "${source}" filtered: repository is not trusted`);
      return false;
    }
    return true;
  });
  if (allowedSources.length > 0) {
    args.push("--setting-sources", allowedSources.join(","));
  }

  return { args, warnings };
}

async function fileCommands(
  provider: NativeAgentProvider,
  path: string,
): Promise<AgentCliCommand[]> {
  const inventory = await invoke<CapabilityInventory>("agent_cap_inventory", { path });
  return inventory.items
    .filter((item) => item.cli === provider && item.kind === "command")
    .map((item) => ({
      name: item.name,
      description: item.description || item.name,
      argumentHint: "",
    }));
}

async function liveCommands(
  provider: NativeAgentProvider,
  path: string,
): Promise<AgentCliCommand[]> {
  if (provider === "claude") {
    const snapshot = await claudeCapabilitySnapshot(path);
    return snapshot.commands.map((command) => ({
      name: command.name,
      description: command.description,
      argumentHint: command.argumentHint,
    }));
  }
  if (provider === "opencode") {
    const snapshot = await openCodeCapabilitySnapshot(path);
    return snapshot.commands.map((command) => ({
      name: command.name,
      description: command.description,
      argumentHint: command.argumentHint,
    }));
  }
  return [];
}

export async function listProviderCommands(
  provider: NativeAgentProvider,
  path: string,
): Promise<AgentCliCommand[]> {
  if (!path) return [];
  const [files, live] = await Promise.all([
    fileCommands(provider, path).catch((): AgentCliCommand[] => []),
    liveCommands(provider, path).catch((): AgentCliCommand[] => []),
  ]);
  return mergeCliCommands(live, files);
}
