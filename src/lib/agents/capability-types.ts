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
