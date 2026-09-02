import { providerSupportsSlashCommand } from "@/lib/agents/provider-meta";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import type { AgentModelOption } from "@/lib/agents/types";

export type SlashCommandEntry = {
  value: string;
  label: string;
  description: string;
  disabled?: boolean;
  acceptsArgument?: boolean;
};

export type AgentCliCommand = {
  name: string;
  description: string;
  argumentHint: string;
};

export type NativeSlashInput = {
  provider: NativeAgentProvider;
  providerLabel: string;
  isClaude: boolean;
  isCodex: boolean;
  threadId: string | null;
  busy: boolean;
  conversationExists: boolean;
  model: string | null;
  models: AgentModelOption[];
  hasTerminalToggle: boolean;
};

const NATIVE_SLASH_COMMANDS = [
  "new",
  "clear",
  "rename",
  "review",
  "fork",
  "compact",
  "plan",
  "goal",
  "model",
  "permissions",
  "memories",
  "chart",
  "barcode",
  "browser",
  "addons",
  "init",
  "capabilities",
  "skills",
  "apps",
  "mcp",
  "hooks",
  "plugins",
  "marketplace",
  "sync",
  "import",
  "terminal",
  "feedback",
  "mention",
  "browse",
  "folder",
  "image",
  "audio",
  "ps",
  "stop",
  "fast",
  "personality",
  "copy",
  "status",
  "usage",
  "archive",
  "delete",
  "logout",
] as const;

const NATIVE_SLASH_SET = new Set<string>(NATIVE_SLASH_COMMANDS);

export function commandName(value: string): string {
  return value.replace(/^\//u, "").trim();
}

export function slashCommandLine(command: string, argument: string): string {
  const name = commandName(command);
  const arg = argument.trim();
  return arg ? `/${name} ${arg}` : `/${name}`;
}

export function isNativeSlashCommand(command: string): boolean {
  return NATIVE_SLASH_SET.has(commandName(command).toLocaleLowerCase());
}

export function shouldRunNativeSlash(
  command: string,
  provider: NativeAgentProvider,
): boolean {
  const name = commandName(command).toLocaleLowerCase();
  return NATIVE_SLASH_SET.has(name) && providerSupportsSlashCommand(provider, name);
}

export function nativeSlashCommands(input: NativeSlashInput): SlashCommandEntry[] {
  const selected = input.models.find((option) => option.id === input.model);
  const commands: SlashCommandEntry[] = [
    { value: "new", label: "Start a new chat", description: "Fresh context in this repository" },
    { value: "clear", label: "Clear into a new chat", description: `${input.providerLabel}-compatible alias for /new` },
    { value: "rename", label: "Rename this chat", description: "Use /rename New title or edit inline", disabled: !input.threadId, acceptsArgument: true },
    { value: "review", label: "Review working tree", description: "Optionally add custom review instructions", disabled: !input.threadId || input.busy, acceptsArgument: true },
    { value: "fork", label: "Fork this chat", description: "Continue from a copy", disabled: !input.threadId || input.busy },
    { value: "compact", label: "Compact context", description: "Summarize older context", disabled: !input.threadId || input.busy },
    { value: "plan", label: "Toggle Plan mode", description: "Switch between Default and Plan" },
    { value: "goal", label: "Set or clear a goal", description: "/goal objective or /goal clear", disabled: !input.threadId, acceptsArgument: true },
    { value: "model", label: "Choose model and effort", description: "/model model-id [effort]", acceptsArgument: true },
    { value: "permissions", label: "Choose permissions", description: `Select a named ${input.providerLabel} permission profile`, acceptsArgument: true },
    { value: "memories", label: "Configure memory", description: "/memories enabled, disabled, or reset", acceptsArgument: true },
    { value: "chart", label: "Visualize data as a chart", description: "/chart what to visualize — renders an interactive chart", disabled: input.busy, acceptsArgument: true },
    { value: "barcode", label: "Render scannable barcodes", description: "/barcode which values to encode — renders scannable codes", disabled: input.busy, acceptsArgument: true },
    { value: "browser", label: "Run an end-to-end test in the browser", description: "/browser what to test — drives a real browser through the browser addon", disabled: input.busy, acceptsArgument: true },
    { value: "addons", label: "Open Addon Studio", description: "Barcode rendering and browser access for every CLI" },
    { value: "init", label: `Create ${input.isClaude ? "CLAUDE.md" : "AGENTS.md"}`, description: `Ask ${input.providerLabel} to add repository instructions`, disabled: input.busy },
    { value: "capabilities", label: "Open Capability Studio", description: "Manage skills, MCP, plugins, apps, and hooks" },
    { value: "skills", label: "Manage skills", description: "Create, edit, enable, duplicate, and remove skills" },
    { value: "apps", label: "Manage apps", description: "Configure apps, tools, and approval policies" },
    { value: "mcp", label: "Show or authenticate MCP servers", description: "/mcp [server-name|verbose]", acceptsArgument: true },
    { value: "hooks", label: "Show lifecycle hooks", description: `Inspect configured ${input.providerLabel} hooks` },
    { value: "plugins", label: "Show plugins", description: "Inspect installed and discoverable plugins" },
    { value: "marketplace", label: "Open capability marketplace", description: "Browse GitHub for skills, MCP servers, hooks, and plugins" },
    { value: "sync", label: "Sync capabilities across CLIs", description: "Copy, delete, or mirror skills and servers between agent CLIs" },
    { value: "import", label: "Import from Claude Code", description: "Preview setup, skills, and recent chats" },
    { value: "terminal", label: "Toggle in-app terminal", description: "Open it beside or below the chat", disabled: !input.hasTerminalToggle },
    { value: "feedback", label: `Send ${input.providerLabel} feedback`, description: input.isCodex ? "Optionally include diagnostic logs" : `Report a ${input.providerLabel} issue` },
    { value: "mention", label: "Mention files", description: "Attach exact local paths" },
    { value: "browse", label: "Browse any file", description: "Attach a path outside the repository" },
    { value: "folder", label: "Mention a folder", description: "Attach a local directory" },
    { value: "image", label: "Attach images", description: "PNG, JPEG, GIF or WebP" },
    { value: "audio", label: "Attach audio", description: "Voice note or audio file" },
    { value: "ps", label: "Background terminals", description: "List running shell processes", disabled: !input.threadId },
    { value: "stop", label: "Stop background terminals", description: "Terminate all background shells", disabled: !input.threadId },
    { value: "fast", label: "Toggle Fast mode", description: "Use the catalog-provided Fast service tier", disabled: !selected?.serviceTiers.length },
    { value: "personality", label: "Set personality", description: "friendly, pragmatic, or none", disabled: !selected?.supportsPersonality, acceptsArgument: true },
    { value: "copy", label: "Copy latest response", description: `Copy the last ${input.providerLabel} message`, disabled: !input.conversationExists },
    { value: "status", label: "Show chat status", description: "Model, effort, permissions, and context" },
    { value: "usage", label: "Show usage limits", description: "Current account rate limits" },
    { value: "archive", label: "Archive this chat", description: "Remove it from the active list", disabled: !input.threadId || input.busy },
    { value: "delete", label: "Delete this chat", description: "Permanently delete the transcript", disabled: !input.threadId || input.busy },
    {
      value: "logout",
      label: `Log out of ${input.providerLabel}`,
      description: `Disconnect the current ${input.isClaude ? "Anthropic" : input.isCodex ? "OpenAI" : "OpenCode"} account`,
    },
  ];
  return commands.filter((command) => providerSupportsSlashCommand(input.provider, command.value));
}

export function mergeSlashCommands(
  native: SlashCommandEntry[],
  cli: AgentCliCommand[],
): SlashCommandEntry[] {
  const seen = new Set(native.map((command) => command.value.toLocaleLowerCase()));
  const extra: SlashCommandEntry[] = [];
  for (const command of cli) {
    const name = commandName(command.name);
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    extra.push({
      value: name,
      label: command.description || name,
      description: command.argumentHint ? `/${name} ${command.argumentHint}` : `/${name}`,
      acceptsArgument: Boolean(command.argumentHint),
    });
  }
  return [...native, ...extra];
}

export function mergeCliCommands(
  live: Array<{ name: string; description?: string; argumentHint?: string }>,
  files: AgentCliCommand[],
): AgentCliCommand[] {
  const byName = new Map<string, AgentCliCommand>();
  for (const command of [...files, ...live]) {
    const name = commandName(command.name);
    if (!name) continue;
    byName.set(name.toLocaleLowerCase(), {
      name,
      description: command.description?.trim() || name,
      argumentHint: command.argumentHint?.trim() ?? "",
    });
  }
  return [...byName.values()];
}
