export type AgentCapabilitySection =
  | "skills"
  | "mcp"
  | "plugins"
  | "apps"
  | "hooks"
  | "sync"
  | "market";

export type AgentSkillScope = "user" | "repo" | "system" | "admin";

export interface AgentSkillInterface {
  displayName?: string;
  shortDescription?: string;
  iconSmall?: string;
  iconLarge?: string;
  iconSmallUrl?: string | null;
  iconLargeUrl?: string | null;
  brandColor?: string;
  defaultPrompt?: string;
}

export interface AgentSkillToolDependency {
  type: string;
  value: string;
  description?: string;
  transport?: string;
  command?: string;
  url?: string;
}

export interface AgentCapabilitySkill {
  name: string;
  description: string;
  shortDescription?: string;
  interface?: AgentSkillInterface;
  dependencies?: { tools: AgentSkillToolDependency[] };
  path: string;
  scope: AgentSkillScope;
  enabled: boolean;
}

export interface AgentCapabilityIssue {
  path: string;
  message: string;
}

export interface AgentMcpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
}

export interface AgentMcpResource {
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  uri: string;
  size?: number;
}

export interface AgentMcpResourceTemplate {
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  uriTemplate: string;
}

export type AgentMcpAuthStatus = "unsupported" | "notLoggedIn" | "bearerToken" | "oAuth" | string;

export interface AgentCapabilityMcpServer {
  name: string;
  serverInfo: {
    name: string;
    title: string | null;
    version: string;
    description: string | null;
    websiteUrl: string | null;
  } | null;
  tools: Record<string, AgentMcpTool>;
  resources: AgentMcpResource[];
  resourceTemplates: AgentMcpResourceTemplate[];
  authStatus: AgentMcpAuthStatus;
  config: Record<string, unknown> | null;
}

export type AgentHookTrustStatus = "managed" | "untrusted" | "trusted" | "modified" | string;

export interface AgentCapabilityHook {
  key: string;
  eventName: string;
  handlerType: string;
  matcher: string | null;
  command: string | null;
  timeoutSec: number;
  statusMessage: string | null;
  additionalContextLimit: number | null;
  sourcePath: string;
  source: string;
  pluginId: string | null;
  displayOrder: number;
  enabled: boolean;
  isManaged: boolean;
  currentHash: string;
  trustStatus: AgentHookTrustStatus;
}

export interface AgentCapabilityHookEntry {
  hooks: AgentCapabilityHook[];
  warnings: string[];
  errors: AgentCapabilityIssue[];
}

export interface AgentPluginInterface {
  displayName: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  developerName: string | null;
  category: string | null;
  capabilities: string[];
  websiteUrl: string | null;
  privacyPolicyUrl: string | null;
  termsOfServiceUrl: string | null;
  defaultPrompt: string[] | null;
  brandColor: string | null;
  composerIcon: string | null;
  composerIconUrl: string | null;
  logo: string | null;
  logoDark: string | null;
  logoUrl: string | null;
  logoUrlDark: string | null;
  screenshots: string[];
  screenshotUrls: string[];
}

export type AgentPluginSource =
  | { type: "local"; path: string }
  | { type: "git"; url: string; path: string | null; refName: string | null; sha: string | null }
  | { type: "npm"; package: string; version: string | null; registry: string | null }
  | { type: "remote" };

export interface AgentCapabilityPlugin {
  id: string;
  remotePluginId: string | null;
  version: string | null;
  localVersion: string | null;
  name: string;
  source: AgentPluginSource;
  installed: boolean;
  enabled: boolean;
  installPolicy: string;
  installPolicySource: string | null;
  mustShowInstallationInterstitial: boolean | null;
  authPolicy: string;
  availability: string;
  interface: AgentPluginInterface | null;
  keywords: string[];
  marketplaceName: string;
  marketplacePath: string | null;
}

export interface AgentCapabilityMarketplace {
  name: string;
  path: string | null;
  displayName: string | null;
  plugins: AgentCapabilityPlugin[];
}

export interface AgentMarketplaceLoadError {
  marketplacePath: string;
  message: string;
}

export interface AgentPluginDetail {
  marketplaceName: string;
  marketplacePath: string | null;
  summary: AgentCapabilityPlugin;
  shareUrl: string | null;
  description: string | null;
  skills: Array<{
    name: string;
    description: string;
    shortDescription: string | null;
    path: string | null;
    enabled: boolean;
  }>;
  hooks: Array<{ key: string; eventName: string }>;
  apps: Array<{ id: string; name: string; description: string | null; installUrl: string | null }>;
  appTemplates: Array<{
    templateId: string;
    name: string;
    description: string | null;
    category: string | null;
  }>;
  mcpServers: string[];
  scheduledTasks: Array<{ name?: string; description?: string | null }> | null;
}

export interface AgentCapabilityApp {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  logoUrlDark: string | null;
  distributionChannel: string | null;
  installUrl: string | null;
  isAccessible: boolean;
  isEnabled: boolean;
  pluginDisplayNames: string[];
  branding: {
    category: string | null;
    developer: string | null;
    website: string | null;
    privacyPolicy: string | null;
    termsOfService: string | null;
    isDiscoverableApp: boolean;
  } | null;
  metadata: {
    categories: string[] | null;
    subCategories: string[] | null;
    seoDescription: string | null;
    developer: string | null;
    version: string | null;
    versionNotes: string | null;
  } | null;
  runtime: {
    runtimeName: string | null;
    enabled: boolean;
    callable: boolean;
  } | null;
  tools: Array<{
    name: string;
    title: string | null;
    description: string;
    isEnabled: boolean;
    disabledReason: string | null;
    isReadOnly: boolean;
  }>;
}

export type AgentConfigMergeStrategy = "replace" | "upsert";

export interface AgentConfigEdit {
  keyPath: string;
  value: unknown;
  mergeStrategy: AgentConfigMergeStrategy;
}

export interface AgentConfigLayerSource {
  type: string;
  file?: string;
  dotCodexFolder?: string;
  id?: string;
  name?: string;
  profile?: string | null;
}

export interface AgentConfigLayer {
  name: AgentConfigLayerSource;
  version: string;
  config: unknown;
  disabledReason: string | null;
}

export interface AgentCapabilityConfig {
  config: Record<string, unknown>;
  origins: Record<string, { name: AgentConfigLayerSource; version: string }>;
  layers: AgentConfigLayer[];
  userConfigPath: string | null;
  projectConfigPath: string;
}

export interface AgentMcpServerDraft {
  baseConfig: Record<string, unknown>;
  name: string;
  transport: "stdio" | "http";
  enabled: boolean;
  required: boolean;
  command: string;
  args: string[];
  cwd: string;
  env: Array<{ key: string; value: string }>;
  envVars: string[];
  remoteEnvVars: string[];
  url: string;
  bearerTokenEnvVar: string;
  auth: "oauth" | "chatgpt";
  oauthResource: string;
  httpHeaders: Array<{ key: string; value: string }>;
  envHttpHeaders: Array<{ key: string; value: string }>;
  startupTimeoutSec: number;
  toolTimeoutSec: number;
  enabledTools: string[];
  disabledTools: string[];
  scopes: string[];
  defaultApprovalMode: "auto" | "prompt" | "writes" | "approve";
  experimentalEnvironment: "local" | "remote";
}

export interface AgentSkillDraft {
  originalPath: string | null;
  scope: "repo" | "user";
  name: string;
  description: string;
  instructions: string;
  displayName: string;
  shortDescription: string;
  iconSmall: string;
  iconLarge: string;
  brandColor: string;
  defaultPrompt: string;
  allowImplicitInvocation: boolean;
  products: Array<"CHAT" | "CODEX">;
  dependencies: AgentSkillToolDependency[];
}

export type PluginStatus = "installed" | "enabled" | "disabled" | "uninstalled";
export type PluginAction = "install" | "enable" | "disable" | "update" | "uninstall";

const PLUGIN_TRANSITIONS: Record<PluginStatus, Partial<Record<PluginAction, PluginStatus>>> = {
  uninstalled: { install: "installed" },
  installed: {
    enable: "enabled",
    disable: "disabled",
    update: "installed",
    uninstall: "uninstalled",
  },
  enabled: {
    disable: "disabled",
    update: "enabled",
    uninstall: "uninstalled",
  },
  disabled: {
    enable: "enabled",
    update: "disabled",
    uninstall: "uninstalled",
  },
};

export type McpSurface = "prompts" | "resources" | "resourceLinks" | "notifications" | "elicitation";
export type McpSurfaceStatus = "native" | "custom-ui" | "unsupported";

export interface McpSurfaceCapabilityResult {
  status: McpSurfaceStatus;
  reason: string;
}

const NOT_EXPOSED: McpSurfaceCapabilityResult = {
  status: "unsupported",
  reason: "not exposed by CLI transport",
};

const MCP_SURFACE_MATRIX: Record<string, Partial<Record<McpSurface, McpSurfaceCapabilityResult>>> = {
  claude: {
    prompts: NOT_EXPOSED,
    resources: NOT_EXPOSED,
    resourceLinks: NOT_EXPOSED,
    notifications: NOT_EXPOSED,
    elicitation: NOT_EXPOSED,
  },
  cursor: {
    prompts: NOT_EXPOSED,
    resources: NOT_EXPOSED,
    resourceLinks: NOT_EXPOSED,
    notifications: NOT_EXPOSED,
    elicitation: NOT_EXPOSED,
  },
  opencode: {
    prompts: NOT_EXPOSED,
    resources: NOT_EXPOSED,
    resourceLinks: NOT_EXPOSED,
    notifications: NOT_EXPOSED,
    elicitation: NOT_EXPOSED,
  },
  codex: {
    prompts: NOT_EXPOSED,
    resources: NOT_EXPOSED,
    resourceLinks: NOT_EXPOSED,
    notifications: NOT_EXPOSED,
    elicitation: NOT_EXPOSED,
  },
};

const KNOWN_MCP_DRIVERS = new Set(Object.keys(MCP_SURFACE_MATRIX));

export function mcpSurfaceCapability(surface: McpSurface, driver: string): McpSurfaceCapabilityResult {
  const entry = MCP_SURFACE_MATRIX[driver]?.[surface];
  if (entry) return entry;
  if (!KNOWN_MCP_DRIVERS.has(driver)) {
    return { status: "unsupported", reason: `unknown driver: ${driver}` };
  }
  return { status: "unsupported", reason: `unknown surface: ${surface}` };
}

export function planPluginTransition(
  current: PluginStatus,
  action: PluginAction,
): { next: PluginStatus } | { error: string } {
  const next = PLUGIN_TRANSITIONS[current]?.[action];
  if (!next) {
    return { error: `cannot ${action} a plugin in state ${current}` };
  }
  return { next };
}

export interface AgentMcpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface AgentMcpPrompt {
  name: string;
  description?: string;
  arguments?: AgentMcpPromptArgument[];
}

export function promptToComposerText(prompt: AgentMcpPrompt, values: Record<string, string>): string {
  const lines: string[] = [];
  if (prompt.description) lines.push(prompt.description);
  for (const argument of prompt.arguments ?? []) {
    const value = values[argument.name] ?? "";
    lines.push(`${argument.name}: ${value}`);
  }
  return lines.join("\n").trim();
}

export type MemoryCommand = "import" | "list" | "clear";

export interface MemoryCommandCapabilityResult {
  status: McpSurfaceStatus;
  reason: string;
}

const MEMORY_COMMAND_MATRIX: Record<string, Partial<Record<MemoryCommand, MemoryCommandCapabilityResult>>> = {
  claude: {
    list: { status: "native", reason: "supported by CLI memory inventory" },
    clear: { status: "native", reason: "supported by CLI memory inventory" },
    import: { status: "unsupported", reason: "import is a Codex-only memory method" },
  },
  codex: {
    list: { status: "unsupported", reason: "not confirmed for Codex transport" },
    clear: { status: "unsupported", reason: "not confirmed for Codex transport" },
    import: { status: "unsupported", reason: "not confirmed for Codex transport" },
  },
};

export function memoryCommandCapability(command: MemoryCommand, driver: string): MemoryCommandCapabilityResult {
  const entry = MEMORY_COMMAND_MATRIX[driver]?.[command];
  if (entry) return entry;
  if (!(driver in MEMORY_COMMAND_MATRIX)) {
    return { status: "unsupported", reason: `unknown driver: ${driver}` };
  }
  return { status: "unsupported", reason: `unknown memory command: ${command}` };
}

export interface NativeBackgroundCapabilityResult {
  status: "unsupported";
  reason: string;
  minVersion: string;
}

export function nativeBackgroundSessionCapability(cliVersion: string): NativeBackgroundCapabilityResult {
  return {
    status: "unsupported",
    reason:
      "Native Background-Sessions und Agent-Teams haben in l8git keinen nachgewiesenen Transport (Discovery/Logs/Attach/Stop/Respawn/Team-Kommunikation ungeklärt); kein Feature-Bau ohne Besitzprüfung.",
    minVersion: cliVersion,
  };
}
