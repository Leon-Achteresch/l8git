import type { CapabilityInventory } from "@/lib/agents/capability-hub";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import { claudeCapabilitySnapshot } from "@/lib/agents/providers/claude/chat-store";
import { openCodeCapabilitySnapshot } from "@/lib/agents/providers/opencode/chat-store";
import type { AgentCapability } from "@/lib/agents/types";
import { invoke } from "@/lib/platform/ipc";
import { mergeCliCommands, type AgentCliCommand } from "@/lib/agents/slash-commands";

export type CliCommandScope = "chat" | "terminal" | "sdk-internal" | "admin";

export interface CliCommandSpec {
  name: string;
  scope: CliCommandScope;
  interactive: boolean;
  minVersion?: string;
  conflictsWith?: readonly string[];
  ticket: string;
  unsupportedReason?: string;
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
  {
    name: "install-github-app",
    scope: "admin",
    interactive: true,
    ticket: "CLI-07",
    unsupportedReason: "Administrationsfläche, nicht in /agents",
  },
  {
    name: "runner",
    scope: "admin",
    interactive: true,
    ticket: "CLI-07",
    unsupportedReason: "Administrationsfläche, nicht in /agents",
  },
  {
    name: "gateway",
    scope: "admin",
    interactive: true,
    ticket: "CLI-07",
    unsupportedReason: "Administrationsfläche, nicht in /agents",
  },
  { name: "chrome", scope: "chat", interactive: false, ticket: "CLI-03" },
  { name: "ide", scope: "chat", interactive: false, ticket: "CLI-03" },
  {
    name: "channels",
    scope: "admin",
    interactive: true,
    ticket: "CLI-04",
    unsupportedReason: "MCP-Channels sind kein Default-Vertrauenspfad in /agents",
  },
  {
    name: "schedule",
    scope: "admin",
    interactive: true,
    ticket: "CLI-05",
    unsupportedReason: "Native Scheduling/Cron ist Administrationsfläche, nicht in /agents",
  },
  {
    name: "remote",
    scope: "admin",
    interactive: true,
    ticket: "CLI-06",
    unsupportedReason: "Native Remote-/Cloud-Sessions sind eine eigene Remote-Ebene, getrennt von l8git-Remote",
  },
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
  if (spec.scope === "admin") {
    return { status: "unsupported", reason: spec.unsupportedReason ?? "Administrationsfläche, nicht in /agents" };
  }
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

export type NativeIntegrationPlatform = "macos" | "windows" | "linux";

const NATIVE_INTEGRATION_PLATFORM_SUPPORT: Record<"chrome" | "ide", readonly NativeIntegrationPlatform[]> = {
  chrome: ["macos", "windows", "linux"],
  ide: ["macos", "windows", "linux"],
};

export function nativeIntegrationCapability(
  name: "chrome" | "ide",
  platform: NativeIntegrationPlatform,
): AgentCapability {
  const supportedPlatforms = NATIVE_INTEGRATION_PLATFORM_SUPPORT[name];
  if (!supportedPlatforms.includes(platform)) {
    return { status: "unsupported", reason: `${name} integration is not available on ${platform}` };
  }
  return { status: "supported" };
}

export function channelInputCapability(currentVersion: string | null): AgentCapability {
  const spec = CLAUDE_CLI_COMMAND_INVENTORY.find((entry) => entry.name === "channels");
  void currentVersion;
  return {
    status: "unsupported",
    reason: spec?.unsupportedReason ?? "MCP-Channels sind kein Default-Vertrauenspfad in /agents",
  };
}

export interface ScheduledTaskSummary {
  id: string;
  name: string;
  schedule: string;
  status: "scheduled" | "running" | "paused" | "stopped" | "expired";
  lastRunAt?: string;
  nextRunAt?: string;
}

export type SessionOrigin = "local" | "nativeRemote" | "l8gitRemote";

export interface SessionOriginMeta {
  isL8gitRemote?: boolean;
  isNativeRemote?: boolean;
  remoteHost?: string;
}

export function classifySessionOrigin(sessionMeta: SessionOriginMeta): SessionOrigin {
  if (sessionMeta.isL8gitRemote) return "l8gitRemote";
  if (sessionMeta.isNativeRemote || sessionMeta.remoteHost) return "nativeRemote";
  return "local";
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
export type ClaudeOutputFormat = "text" | "json" | "stream-json";

export interface ClaudeLaunchArgsInput {
  systemPrompt?: string;
  appendSystemPrompt?: string;
  settingSources: ClaudeSettingSource[];
  trusted: boolean;
  outputFormat?: ClaudeOutputFormat;
  jsonSchema?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  model?: string;
  fallbackModel?: string;
  thinkingEffort?: string;
  chrome?: { enabled: boolean; platform: NativeIntegrationPlatform };
  ide?: { enabled: boolean; platform: NativeIntegrationPlatform };
  allowedTools?: string[];
  disallowedTools?: string[];
  strictMcpConfig?: boolean;
  mcpConfigPaths?: string[];
}

export interface ClaudeLaunchArgsResult {
  args: string[];
  warnings: string[];
}

export function buildClaudeLaunchArgs(input: ClaudeLaunchArgsInput): ClaudeLaunchArgsResult {
  const {
    systemPrompt,
    appendSystemPrompt,
    settingSources,
    trusted,
    outputFormat,
    jsonSchema,
    maxTurns,
    maxBudgetUsd,
    model,
    fallbackModel,
    thinkingEffort,
    chrome,
    ide,
    allowedTools,
    disallowedTools,
    strictMcpConfig,
    mcpConfigPaths,
  } = input;
  if (systemPrompt !== undefined && appendSystemPrompt !== undefined) {
    throw new Error("systemPrompt and appendSystemPrompt cannot be set at the same time");
  }
  if (jsonSchema !== undefined && outputFormat !== "json") {
    throw new Error("jsonSchema requires outputFormat to be json");
  }
  if (maxTurns !== undefined && (!Number.isSafeInteger(maxTurns) || maxTurns < 1)) {
    throw new Error("maxTurns must be at least 1");
  }
  if (maxBudgetUsd !== undefined && (!Number.isFinite(maxBudgetUsd) || maxBudgetUsd <= 0)) {
    throw new Error("maxBudgetUsd must be greater than 0");
  }
  if (fallbackModel !== undefined && model === undefined) {
    throw new Error("fallbackModel requires model to be set");
  }
  if (fallbackModel !== undefined && fallbackModel === model) {
    throw new Error("fallbackModel must differ from model");
  }
  if (allowedTools !== undefined && disallowedTools !== undefined) {
    const overlap = allowedTools.filter((tool) => disallowedTools.includes(tool));
    if (overlap.length > 0) {
      throw new Error(`allowedTools and disallowedTools overlap: ${overlap.join(", ")}`);
    }
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

  if (model !== undefined) {
    args.push("--model", model);
  }
  if (fallbackModel !== undefined) {
    args.push("--fallback-model", fallbackModel);
  }
  if (thinkingEffort !== undefined) {
    args.push("--thinking-effort", thinkingEffort);
  }
  if (outputFormat !== undefined) {
    args.push("--output-format", outputFormat);
  }
  if (jsonSchema !== undefined) {
    args.push("--json-schema", jsonSchema);
  }
  if (maxTurns !== undefined) {
    args.push("--max-turns", String(maxTurns));
  }
  if (maxBudgetUsd !== undefined) {
    args.push("--max-budget-usd", String(maxBudgetUsd));
  }

  if (chrome?.enabled) {
    const capability = nativeIntegrationCapability("chrome", chrome.platform);
    if (capability.status === "supported") {
      args.push("--chrome");
    } else {
      warnings.push(capability.reason ?? "chrome integration unsupported");
    }
  }
  if (ide?.enabled) {
    const capability = nativeIntegrationCapability("ide", ide.platform);
    if (capability.status === "supported") {
      args.push("--ide");
    } else {
      warnings.push(capability.reason ?? "ide integration unsupported");
    }
  }

  if (allowedTools !== undefined && allowedTools.length > 0) {
    args.push("--allowedTools", allowedTools.join(","));
  }
  if (disallowedTools !== undefined && disallowedTools.length > 0) {
    args.push("--disallowedTools", disallowedTools.join(","));
  }
  if (strictMcpConfig) {
    args.push("--strict-mcp-config");
  }
  if (mcpConfigPaths !== undefined && mcpConfigPaths.length > 0) {
    for (const path of mcpConfigPaths) {
      args.push("--mcp-config", path);
    }
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

const REDACTED_PLACEHOLDER = "[redacted]";
const SECRET_PATTERN =
  /(sk-[a-z0-9-]{10,}|ghp_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|gh[pousr]_[a-z0-9]{20,}|xox[baprs]-[a-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9a-z_-]{20,}|eyJ[a-z0-9_-]{10,}\.eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|Bearer\s+[a-z0-9._-]{10,})/gi;

function redact(value: string): string {
  return value.replace(SECRET_PATTERN, REDACTED_PLACEHOLDER);
}

export interface FeedbackDiagnostics {
  commentary?: string;
  transcriptExcerpt?: string;
  redactedReport?: string;
}

export interface FeedbackPreviewInput {
  message: string;
  diagnostics?: FeedbackDiagnostics;
}

export interface FeedbackPreview {
  text: string;
  includedFields: string[];
}

export function buildFeedbackPreview(input: FeedbackPreviewInput): FeedbackPreview {
  const { message, diagnostics } = input;
  if (!message || !message.trim()) {
    throw new Error("message is required");
  }
  const includedFields: string[] = ["message"];
  const sections: string[] = [redact(message.trim())];

  if (diagnostics?.commentary) {
    includedFields.push("commentary");
    sections.push(redact(diagnostics.commentary.trim()));
  }
  if (diagnostics?.transcriptExcerpt) {
    includedFields.push("transcriptExcerpt");
    sections.push(redact(diagnostics.transcriptExcerpt.trim()));
  }
  if (diagnostics?.redactedReport) {
    includedFields.push("redactedReport");
    sections.push(redact(diagnostics.redactedReport.trim()));
  }

  return { text: sections.join("\n\n"), includedFields };
}

export interface SendFeedbackResult {
  command: string;
  args: string[];
}

export function sendFeedback(preview: FeedbackPreview, confirm: boolean): SendFeedbackResult {
  if (!confirm) {
    throw new Error("sendFeedback requires explicit confirm");
  }
  return { command: "claude", args: ["/bug", preview.text] };
}

export interface CompactSettings {
  autoCompact: boolean;
  compactOnResume: boolean;
}

export interface CompactSettingsValidation {
  status: "supported" | "unsupported";
  reason?: string;
}

export function validateCompactSettings(
  settings: Partial<CompactSettings> | undefined,
  testedCliVersions: readonly string[],
  currentVersion: string | null,
): CompactSettingsValidation {
  if (!settings || (settings.autoCompact === undefined && settings.compactOnResume === undefined)) {
    return { status: "unsupported", reason: "no compact setting provided" };
  }
  if (!currentVersion || !testedCliVersions.includes(currentVersion)) {
    return { status: "unsupported", reason: "compact setting not validated against the current CLI version" };
  }
  return { status: "supported" };
}

export function applyCompactSettingsToLaunchArgs(
  args: string[],
  settings: CompactSettings,
): string[] {
  const next = [...args];
  next.push("--auto-compact", settings.autoCompact ? "true" : "false");
  if (settings.compactOnResume) {
    next.push("--compact-on-resume");
  }
  return next;
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
