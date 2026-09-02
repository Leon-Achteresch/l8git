import type { CapabilityInventory } from "@/lib/agents/capability-hub";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import { claudeCapabilitySnapshot } from "@/lib/agents/providers/claude/chat-store";
import { openCodeCapabilitySnapshot } from "@/lib/agents/providers/opencode/chat-store";
import { invoke } from "@/lib/platform/ipc";
import { mergeCliCommands, type AgentCliCommand } from "@/lib/agents/slash-commands";

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
