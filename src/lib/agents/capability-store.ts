import { create } from "zustand";

import type {
  AgentCapabilityApp,
  AgentCapabilityConfig,
  AgentCapabilityHookEntry,
  AgentCapabilityMarketplace,
  AgentCapabilityMcpServer,
  AgentCapabilityPlugin,
  AgentCapabilitySection,
  AgentCapabilitySkill,
  AgentConfigEdit,
  AgentMarketplaceLoadError,
  AgentMcpServerDraft,
  AgentPluginDetail,
  AgentSkillDraft,
} from "@/lib/agents/capability-types";
import { codexSessionManager } from "@/lib/agents/session-manager";

type SectionErrors = Partial<Record<AgentCapabilitySection | "config", string>>;

interface AgentCapabilityState {
  path: string | null;
  loading: boolean;
  busyKey: string | null;
  loadedAt: number | null;
  errors: SectionErrors;
  skills: AgentCapabilitySkill[];
  skillErrors: Array<{ path: string; message: string }>;
  mcpServers: AgentCapabilityMcpServer[];
  hooks: AgentCapabilityHookEntry;
  marketplaces: AgentCapabilityMarketplace[];
  marketplaceErrors: AgentMarketplaceLoadError[];
  featuredPluginIds: string[];
  apps: AgentCapabilityApp[];
  config: AgentCapabilityConfig | null;
  pluginDetails: Record<string, AgentPluginDetail>;
  load: (path: string, force?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  setSkillEnabled: (skill: AgentCapabilitySkill, enabled: boolean) => Promise<void>;
  readSkillDraft: (skill: AgentCapabilitySkill) => Promise<AgentSkillDraft>;
  saveSkill: (draft: AgentSkillDraft) => Promise<AgentCapabilitySkill>;
  duplicateSkill: (skill: AgentCapabilitySkill, name: string) => Promise<void>;
  deleteSkill: (skill: AgentCapabilitySkill) => Promise<string>;
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, contents: string) => Promise<void>;
  backupAndWriteTextFile: (path: string, contents: string) => Promise<string | null>;
  ensureTextFile: (path: string, initialContents?: string) => Promise<string>;
  createHookFile: (scope: "repo" | "user") => Promise<string>;
  setHooksEnabled: (enabled: boolean) => Promise<void>;
  saveMcpServer: (draft: AgentMcpServerDraft, originalName?: string) => Promise<void>;
  setMcpServerEnabled: (serverName: string, enabled: boolean) => Promise<void>;
  setMcpToolPolicy: (
    serverName: string,
    toolName: string,
    enabled: boolean,
    approvalMode?: "auto" | "prompt" | "writes" | "approve",
  ) => Promise<void>;
  deleteMcpServer: (serverName: string) => Promise<void>;
  loginMcpServer: (serverName: string) => Promise<string>;
  readPlugin: (plugin: AgentCapabilityPlugin) => Promise<AgentPluginDetail>;
  installPlugin: (plugin: AgentCapabilityPlugin) => Promise<string[]>;
  uninstallPlugin: (plugin: AgentCapabilityPlugin) => Promise<void>;
  setPluginEnabled: (plugin: AgentCapabilityPlugin, enabled: boolean) => Promise<void>;
  setPluginMcpEnabled: (pluginId: string, serverName: string, enabled: boolean) => Promise<void>;
  setPluginMcpToolPolicy: (
    pluginId: string,
    serverName: string,
    toolName: string,
    enabled: boolean,
    approvalMode: "auto" | "prompt" | "writes" | "approve",
  ) => Promise<void>;
  addMarketplace: (source: string, refName?: string, sparsePaths?: string[]) => Promise<void>;
  removeMarketplace: (name: string) => Promise<void>;
  upgradeMarketplace: (name?: string) => Promise<void>;
  setAppEnabled: (app: AgentCapabilityApp, enabled: boolean) => Promise<void>;
  updateAppPolicy: (
    appId: string,
    edits: Array<{
      key: "destructive_enabled" | "open_world_enabled" | "default_tools_approval_mode" | "default_tools_enabled" | "approvals_reviewer";
      value: boolean | string;
    }>,
  ) => Promise<void>;
  updateAppToolPolicy: (
    appId: string,
    toolName: string,
    enabled: boolean,
    approvalMode: "auto" | "prompt" | "writes" | "approve",
  ) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  return fallback;
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function pathSeparator(path: string): "/" | "\\" {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

function joinPath(base: string, ...parts: string[]): string {
  const separator = pathSeparator(base);
  return [base.replace(/[\\/]+$/u, ""), ...parts.map((part) => part.replace(/^[\\/]+|[\\/]+$/gu, ""))]
    .filter(Boolean)
    .join(separator);
}

function dirname(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? path : path.slice(0, index);
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/u).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function backupStamp(): string {
  return new Date().toISOString().replace(/[:.]/gu, "-");
}

function skillBackupPath(skillPath: string): string {
  const skillDirectory = dirname(skillPath);
  const skillsDirectory = dirname(skillDirectory);
  const agentDirectory = dirname(skillsDirectory);
  return joinPath(agentDirectory, ".l8git-backups", `${basename(skillDirectory)}-${backupStamp()}`);
}

function configKeySegment(value: string): string {
  return /^[A-Za-z0-9_-]+$/u.test(value) ? value : JSON.stringify(value);
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToUtf8(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

function skillBody(markdown: string): string {
  if (!markdown.startsWith("---")) return markdown.trim();
  const match = /^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/u.exec(markdown);
  return match ? markdown.slice(match[0].length).trim() : markdown.trim();
}

function skillMarkdown(draft: AgentSkillDraft): string {
  return [
    "---",
    `name: ${draft.name}`,
    `description: ${JSON.stringify(draft.description.trim())}`,
    "---",
    "",
    draft.instructions.trim(),
    "",
  ].join("\n");
}

function skillMetadataYaml(draft: AgentSkillDraft): string {
  const displayName = draft.displayName.trim() || draft.name;
  const shortDescription = draft.shortDescription.trim() || draft.description.trim().slice(0, 160);
  const lines = ["interface:"];
  lines.push(`  display_name: ${JSON.stringify(displayName)}`);
  lines.push(`  short_description: ${JSON.stringify(shortDescription)}`);
  if (draft.iconSmall.trim()) lines.push(`  icon_small: ${JSON.stringify(draft.iconSmall.trim())}`);
  if (draft.iconLarge.trim()) lines.push(`  icon_large: ${JSON.stringify(draft.iconLarge.trim())}`);
  if (draft.brandColor.trim()) lines.push(`  brand_color: ${JSON.stringify(draft.brandColor.trim())}`);
  if (draft.defaultPrompt.trim()) {
    lines.push(`  default_prompt: ${JSON.stringify(draft.defaultPrompt.trim())}`);
  }
  lines.push("", "policy:");
  if (draft.products.length) lines.push(`  products: ${JSON.stringify(draft.products)}`);
  lines.push(`  allow_implicit_invocation: ${draft.allowImplicitInvocation}`);
  if (draft.dependencies.length) {
    lines.push("", "dependencies:", "  tools:");
    for (const dependency of draft.dependencies) {
      lines.push(`    - type: ${JSON.stringify(dependency.type)}`);
      lines.push(`      value: ${JSON.stringify(dependency.value)}`);
      if (dependency.description) lines.push(`      description: ${JSON.stringify(dependency.description)}`);
      if (dependency.transport) lines.push(`      transport: ${JSON.stringify(dependency.transport)}`);
      if (dependency.command) lines.push(`      command: ${JSON.stringify(dependency.command)}`);
      if (dependency.url) lines.push(`      url: ${JSON.stringify(dependency.url)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function configuredMcpServers(config: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const value = config.mcp_servers;
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1])),
  );
}

function mergeMcpInventory(
  runtime: AgentCapabilityMcpServer[],
  config: Record<string, unknown>,
): AgentCapabilityMcpServer[] {
  const configured = configuredMcpServers(config);
  const byName = new Map<string, AgentCapabilityMcpServer>();
  for (const server of runtime) {
    byName.set(server.name, {
      ...server,
      tools: isRecord(server.tools) ? server.tools : {},
      resources: Array.isArray(server.resources) ? server.resources : [],
      resourceTemplates: Array.isArray(server.resourceTemplates) ? server.resourceTemplates : [],
      config: configured[server.name] ?? null,
    });
  }
  for (const [name, serverConfig] of Object.entries(configured)) {
    if (byName.has(name)) continue;
    byName.set(name, {
      name,
      serverInfo: null,
      tools: {},
      resources: [],
      resourceTemplates: [],
      authStatus: "unavailable",
      config: serverConfig,
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function normalizePluginMarketplaces(
  marketplaces: AgentCapabilityMarketplace[],
): AgentCapabilityMarketplace[] {
  return marketplaces.map((marketplace) => ({
    ...marketplace,
    displayName: marketplace.displayName ?? (marketplace as unknown as { interface?: { displayName?: string } }).interface?.displayName ?? null,
    plugins: (marketplace.plugins ?? []).map((plugin) => ({
      ...plugin,
      marketplaceName: marketplace.name,
      marketplacePath: marketplace.path,
      interface: plugin.interface ?? null,
      keywords: plugin.keywords ?? [],
    })),
  }));
}

function normalizeHookEntry(value: AgentCapabilityHookEntry | undefined): AgentCapabilityHookEntry {
  return {
    hooks: (value?.hooks ?? []).map((hook) => ({
      ...hook,
      timeoutSec: numberValue(hook.timeoutSec, 600),
      displayOrder: numberValue(hook.displayOrder),
    })),
    warnings: value?.warnings ?? [],
    errors: value?.errors ?? [],
  };
}

function userConfigPathFromLayers(layers: AgentCapabilityConfig["layers"]): string | null {
  for (const layer of layers) {
    if (layer.name.type === "user" && layer.name.file) return layer.name.file;
  }
  return null;
}

function normalizeConfig(
  path: string,
  raw: Omit<AgentCapabilityConfig, "userConfigPath" | "projectConfigPath">,
): AgentCapabilityConfig {
  const layers = Array.isArray(raw.layers) ? raw.layers : [];
  return {
    config: isRecord(raw.config) ? raw.config : {},
    origins: isRecord(raw.origins) ? raw.origins : {},
    layers,
    userConfigPath: userConfigPathFromLayers(layers),
    projectConfigPath: joinPath(path, ".codex", "config.toml"),
  };
}

function normalizeApps(
  rawApps: AgentCapabilityApp[],
  installed: Array<{ id: string; runtimeName: string | null; enabled: boolean; callable: boolean }>,
  details: Array<{
    id: string;
    toolSummaries: AgentCapabilityApp["tools"] | null;
  }>,
): AgentCapabilityApp[] {
  const installedById = new Map(installed.map((app) => [app.id, app]));
  const detailsById = new Map(details.map((app) => [app.id, app]));
  return rawApps.map((raw) => {
    const source = raw as unknown as AgentCapabilityApp & {
      appMetadata?: AgentCapabilityApp["metadata"];
    };
    return {
      ...raw,
      logoUrl: raw.logoUrl ?? null,
      logoUrlDark: raw.logoUrlDark ?? null,
      distributionChannel: raw.distributionChannel ?? null,
      installUrl: raw.installUrl ?? null,
      pluginDisplayNames: raw.pluginDisplayNames ?? [],
      branding: raw.branding ?? null,
      metadata: source.metadata ?? source.appMetadata ?? null,
      runtime: installedById.get(raw.id) ?? null,
      tools: detailsById.get(raw.id)?.toolSummaries ?? [],
    };
  });
}

function mcpConfigFromDraft(draft: AgentMcpServerDraft): Record<string, unknown> {
  const common: Record<string, unknown> = {
    ...draft.baseConfig,
    enabled: draft.enabled,
    required: draft.required,
    startup_timeout_sec: draft.startupTimeoutSec,
    tool_timeout_sec: draft.toolTimeoutSec,
    default_tools_approval_mode: draft.defaultApprovalMode,
    experimental_environment: draft.experimentalEnvironment,
  };
  delete common.startup_timeout_ms;
  if (draft.enabledTools.length) common.enabled_tools = draft.enabledTools;
  else delete common.enabled_tools;
  if (draft.disabledTools.length) common.disabled_tools = draft.disabledTools;
  else delete common.disabled_tools;
  if (draft.scopes.length) common.scopes = draft.scopes;
  else delete common.scopes;
  if (draft.transport === "http") {
    delete common.command;
    delete common.args;
    delete common.cwd;
    delete common.env;
    delete common.env_vars;
    common.url = draft.url.trim();
    common.auth = draft.auth;
    if (draft.oauthResource.trim()) common.oauth_resource = draft.oauthResource.trim();
    else delete common.oauth_resource;
    if (draft.bearerTokenEnvVar.trim()) common.bearer_token_env_var = draft.bearerTokenEnvVar.trim();
    else delete common.bearer_token_env_var;
    const headers = Object.fromEntries(draft.httpHeaders.filter((item) => item.key.trim()).map((item) => [item.key.trim(), item.value]));
    const envHeaders = Object.fromEntries(draft.envHttpHeaders.filter((item) => item.key.trim()).map((item) => [item.key.trim(), item.value.trim()]));
    if (Object.keys(headers).length) common.http_headers = headers;
    else delete common.http_headers;
    if (Object.keys(envHeaders).length) common.env_http_headers = envHeaders;
    else delete common.env_http_headers;
  } else {
    delete common.url;
    delete common.auth;
    delete common.oauth_resource;
    delete common.bearer_token_env_var;
    delete common.http_headers;
    delete common.env_http_headers;
    delete common.scopes;
    common.command = draft.command.trim();
    if (draft.args.length) common.args = draft.args;
    else delete common.args;
    if (draft.cwd.trim()) common.cwd = draft.cwd.trim();
    else delete common.cwd;
    const env = Object.fromEntries(draft.env.filter((item) => item.key.trim()).map((item) => [item.key.trim(), item.value]));
    if (Object.keys(env).length) common.env = env;
    else delete common.env;
    const envVars: unknown[] = [
      ...draft.envVars,
      ...draft.remoteEnvVars.map((name) => ({ name, source: "remote" })),
    ];
    if (envVars.length) common.env_vars = envVars;
    else delete common.env_vars;
  }
  return common;
}

async function withControlClient<T>(callback: (client: Awaited<ReturnType<typeof codexSessionManager.controlClient>>) => Promise<T>): Promise<T> {
  const client = await codexSessionManager.controlClient();
  try {
    return await callback(client);
  } finally {
    codexSessionManager.releaseControl();
  }
}

const capabilityLoadPromises = new Map<string, Promise<void>>();

export const useAgentCapabilityStore = create<AgentCapabilityState>((set, get) => ({
  path: null,
  loading: false,
  busyKey: null,
  loadedAt: null,
  errors: {},
  skills: [],
  skillErrors: [],
  mcpServers: [],
  hooks: { hooks: [], warnings: [], errors: [] },
  marketplaces: [],
  marketplaceErrors: [],
  featuredPluginIds: [],
  apps: [],
  config: null,
  pluginDetails: {},

  load: async (path, force = false) => {
    if (!force && get().path === path && get().loadedAt && Date.now() - (get().loadedAt ?? 0) < 20_000) {
      return;
    }
    const pending = capabilityLoadPromises.get(path);
    if (pending) return pending;

    const loadPromise = (async () => {
      set({ path, loading: true, errors: {} });
      await withControlClient(async (client) => {
      const configResult = await Promise.allSettled([client.readConfig(path)]).then(([result]) => result);
      const normalizedConfig = configResult.status === "fulfilled"
        ? normalizeConfig(path, configResult.value)
        : null;
      const errors: SectionErrors = {};
      if (configResult.status === "rejected") errors.config = errorMessage(configResult.reason);

      const [skillsResult, mcpResult, hooksResult, pluginsResult, appsResult, installedAppsResult] = await Promise.allSettled([
        client.capabilitySkills(path, force),
        (async () => {
          const data: AgentCapabilityMcpServer[] = [];
          let cursor: string | undefined;
          do {
            const response = await client.capabilityMcpServers(undefined, cursor);
            data.push(...response.data);
            cursor = response.nextCursor ?? undefined;
          } while (cursor);
          return data;
        })(),
        client.capabilityHooks(path),
        client.capabilityPlugins(path, force),
        (async () => {
          const data: AgentCapabilityApp[] = [];
          let cursor: string | undefined;
          do {
            const response = await client.capabilityApps(undefined, cursor, force);
            data.push(...response.data);
            cursor = response.nextCursor ?? undefined;
          } while (cursor);
          return data;
        })(),
        client.installedApps(undefined, force),
      ]);

      if (skillsResult.status === "rejected") errors.skills = errorMessage(skillsResult.reason);
      if (mcpResult.status === "rejected") errors.mcp = errorMessage(mcpResult.reason);
      if (hooksResult.status === "rejected") errors.hooks = errorMessage(hooksResult.reason);
      if (pluginsResult.status === "rejected") errors.plugins = errorMessage(pluginsResult.reason);
      if (appsResult.status === "rejected" || installedAppsResult.status === "rejected") {
        errors.apps = [
          appsResult.status === "rejected" ? errorMessage(appsResult.reason) : null,
          installedAppsResult.status === "rejected" ? errorMessage(installedAppsResult.reason) : null,
        ].filter(Boolean).join(" · ");
      }

      const skillEntry = skillsResult.status === "fulfilled"
        ? skillsResult.value.data.find((entry) => entry.cwd === path)
        : undefined;
      const hookEntry = hooksResult.status === "fulfilled"
        ? hooksResult.value.data.find((entry) => entry.cwd === path)
        : undefined;
      const rawApps = appsResult.status === "fulfilled" ? appsResult.value : [];
      let appDetails: Array<{ id: string; toolSummaries: AgentCapabilityApp["tools"] | null }> = [];
      if (rawApps.length) {
        const detailResult = await Promise.allSettled([client.readApps(rawApps.map((app) => app.id))]).then(([result]) => result);
        if (detailResult.status === "fulfilled") appDetails = detailResult.value.apps;
        else errors.apps = [errors.apps, errorMessage(detailResult.reason)].filter(Boolean).join(" · ");
      }

      if (get().path !== path) return;
      set({
        path,
        loading: false,
        loadedAt: Date.now(),
        errors,
        config: normalizedConfig,
        skills: skillEntry?.skills ?? [],
        skillErrors: skillEntry?.errors ?? [],
        mcpServers: mergeMcpInventory(
          mcpResult.status === "fulfilled" ? mcpResult.value : [],
          normalizedConfig?.config ?? {},
        ),
        hooks: normalizeHookEntry(hookEntry),
        marketplaces: pluginsResult.status === "fulfilled"
          ? normalizePluginMarketplaces(pluginsResult.value.marketplaces)
          : [],
        marketplaceErrors: pluginsResult.status === "fulfilled"
          ? pluginsResult.value.marketplaceLoadErrors
          : [],
        featuredPluginIds: pluginsResult.status === "fulfilled"
          ? pluginsResult.value.featuredPluginIds
          : [],
        apps: normalizeApps(
          rawApps,
          installedAppsResult.status === "fulfilled" ? installedAppsResult.value.apps : [],
          appDetails,
        ),
      });
      }).catch((error) => {
        if (get().path === path) set({ loading: false, errors: { config: errorMessage(error) } });
        throw error;
      });
    })();
    capabilityLoadPromises.set(path, loadPromise);
    try {
      await loadPromise;
    } finally {
      if (capabilityLoadPromises.get(path) === loadPromise) capabilityLoadPromises.delete(path);
    }
  },

  refresh: async () => {
    const path = get().path;
    if (path) await get().load(path, true);
  },

  setSkillEnabled: async (skill, enabled) => {
    set({ busyKey: `skill:${skill.path}` });
    try {
      await withControlClient((client) => client.setSkillEnabled(skill.path, enabled));
      set((state) => ({
        skills: state.skills.map((item) => item.path === skill.path ? { ...item, enabled } : item),
      }));
    } finally {
      set({ busyKey: null });
    }
  },

  readTextFile: async (path) => withControlClient(async (client) => {
    const response = await client.readHostFile(path);
    return base64ToUtf8(response.dataBase64);
  }),

  writeTextFile: async (path, contents) => {
    set({ busyKey: `file:${path}` });
    try {
      await withControlClient((client) => client.writeHostFile(path, utf8ToBase64(contents)));
    } finally {
      set({ busyKey: null });
    }
  },

  backupAndWriteTextFile: async (path, contents) => {
    set({ busyKey: `file:${path}` });
    try {
      return await withControlClient(async (client) => {
        let backupPath: string | null = null;
        try {
          await client.readHostFile(path);
          backupPath = `${path}.l8git-backup-${backupStamp()}`;
          await client.copyHostPath(path, backupPath);
        } catch {
          backupPath = null;
        }
        await client.writeHostFile(path, utf8ToBase64(contents));
        return backupPath;
      });
    } finally {
      set({ busyKey: null });
    }
  },

  ensureTextFile: async (path, initialContents = "") => {
    set({ busyKey: `file:${path}` });
    try {
      return await withControlClient(async (client) => {
        try {
          const response = await client.readHostFile(path);
          return base64ToUtf8(response.dataBase64);
        } catch {
          await client.createHostDirectory(dirname(path));
          await client.writeHostFile(path, utf8ToBase64(initialContents));
          return initialContents;
        }
      });
    } finally {
      set({ busyKey: null });
    }
  },

  createHookFile: async (scope) => {
    const repositoryPath = get().path;
    if (!repositoryPath) throw new Error("Kein Repository ausgewählt.");
    const config = get().config;
    const directory = scope === "repo"
      ? joinPath(repositoryPath, ".codex")
      : config?.userConfigPath
        ? dirname(config.userConfigPath)
        : null;
    if (!directory) throw new Error("Der persönliche Codex-Ordner konnte nicht bestimmt werden.");
    const hookPath = joinPath(directory, "hooks.json");
    const initial = `${JSON.stringify({
      description: scope === "repo" ? "Repository lifecycle hooks" : "Personal lifecycle hooks",
      hooks: {},
    }, null, 2)}\n`;
    set({ busyKey: `file:${hookPath}` });
    try {
      await withControlClient(async (client) => {
        try {
          await client.readHostFile(hookPath);
          return;
        } catch {
          // Create a new source only when none exists; never overwrite hooks implicitly.
        }
        await client.createHostDirectory(directory);
        await client.writeHostFile(hookPath, utf8ToBase64(initial));
      });
      return hookPath;
    } finally {
      set({ busyKey: null });
    }
  },

  setHooksEnabled: async (enabled) => {
    set({ busyKey: "hooks:feature" });
    try {
      await withControlClient((client) => client.writeConfigValue("features.hooks", enabled));
      const path = get().path;
      if (path) await get().load(path, true);
    } finally {
      set({ busyKey: null });
    }
  },

  readSkillDraft: async (skill) => {
    const markdown = await get().readTextFile(skill.path);
    const metadataPath = joinPath(dirname(skill.path), "agents", "openai.yaml");
    const metadata = await get().readTextFile(metadataPath).catch(() => "");
    const implicitMatch = /^\s*allow_implicit_invocation\s*:\s*(true|false)\s*$/imu.exec(metadata);
    const productsMatch = /^\s*products\s*:\s*([^\r\n]+)$/imu.exec(metadata);
    const products = productsMatch
      ? (["CHAT", "CODEX"] as const).filter((product) => productsMatch[1].includes(product))
      : (["CODEX"] as Array<"CHAT" | "CODEX">);
    return {
      originalPath: skill.path,
      scope: skill.scope === "repo" ? "repo" : "user",
      name: skill.name,
      description: skill.description,
      instructions: skillBody(markdown),
      displayName: skill.interface?.displayName ?? "",
      shortDescription: skill.interface?.shortDescription ?? skill.shortDescription ?? "",
      iconSmall: skill.interface?.iconSmall ?? "",
      iconLarge: skill.interface?.iconLarge ?? "",
      brandColor: skill.interface?.brandColor ?? "",
      defaultPrompt: skill.interface?.defaultPrompt ?? "",
      allowImplicitInvocation: implicitMatch ? implicitMatch[1].toLocaleLowerCase() === "true" : true,
      products: [...products],
      dependencies: skill.dependencies?.tools ?? [],
    };
  },

  saveSkill: async (draft) => {
    const path = get().path;
    if (!path) throw new Error("Kein Repository ausgewählt.");
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/u.test(draft.name)) {
      throw new Error("Der Skill-Name darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.");
    }
    if (!draft.description.trim()) throw new Error("Eine Skill-Beschreibung ist erforderlich.");
    if (!draft.instructions.trim()) throw new Error("Skill-Anweisungen dürfen nicht leer sein.");
    for (const assetPath of [draft.iconSmall, draft.iconLarge]) {
      if (assetPath.trim() && (!assetPath.trim().startsWith("./") || assetPath.includes(".."))) {
        throw new Error("Skill-Icons müssen als sicherer relativer Pfad mit ./ angegeben werden.");
      }
    }
    if (draft.brandColor.trim() && !/^#[0-9a-f]{6}$/iu.test(draft.brandColor.trim())) {
      throw new Error("Die Skill-Farbe muss als sechsstelliger Hex-Wert angegeben werden.");
    }
    if (draft.dependencies.some((dependency) => !dependency.type.trim() || !dependency.value.trim())) {
      throw new Error("Jede Skill-Abhängigkeit benötigt Typ und Wert.");
    }
    const config = get().config;
    const existingUserRoot = get().skills.find((skill) => skill.scope === "user")?.path;
    const userHome = config?.userConfigPath ? dirname(dirname(config.userConfigPath)) : null;
    const root = draft.scope === "repo"
      ? joinPath(path, ".agents", "skills")
      : existingUserRoot
        ? dirname(dirname(existingUserRoot))
        : userHome
          ? joinPath(userHome, ".agents", "skills")
          : null;
    if (!root) throw new Error("Der persönliche Skill-Ordner konnte nicht bestimmt werden.");
    const skillPath = draft.originalPath ?? joinPath(root, draft.name, "SKILL.md");
    const skillDirectory = dirname(skillPath);
    if (draft.originalPath && draft.name !== get().skills.find((skill) => skill.path === draft.originalPath)?.name) {
      throw new Error("Der technische Name eines bestehenden Skills kann nicht geändert werden. Dupliziere ihn stattdessen.");
    }
    set({ busyKey: `skill:${skillPath}` });
    try {
      await withControlClient(async (client) => {
        for (const assetPath of [draft.iconSmall, draft.iconLarge]) {
          if (!assetPath.trim()) continue;
          try {
            await client.readHostFile(joinPath(skillDirectory, assetPath.trim().slice(2)));
          } catch {
            throw new Error(`Das Skill-Icon wurde nicht gefunden: ${assetPath.trim()}`);
          }
        }
        if (draft.originalPath) {
          const backupPath = skillBackupPath(skillPath);
          await client.createHostDirectory(dirname(backupPath));
          await client.copyHostPath(skillDirectory, backupPath);
        }
        await client.createHostDirectory(skillDirectory);
        await client.writeHostFile(skillPath, utf8ToBase64(skillMarkdown(draft)));
        const metadataDirectory = joinPath(skillDirectory, "agents");
        await client.createHostDirectory(metadataDirectory);
        await client.writeHostFile(
          joinPath(metadataDirectory, "openai.yaml"),
          utf8ToBase64(skillMetadataYaml(draft)),
        );
      });
      await get().load(path, true);
      const result = get().skills.find((skill) => skill.path === skillPath || skill.name === draft.name);
      if (!result) throw new Error("Der Skill wurde gespeichert, aber noch nicht von Codex erkannt.");
      return result;
    } finally {
      set({ busyKey: null });
    }
  },

  duplicateSkill: async (skill, name) => {
    const draft = await get().readSkillDraft(skill);
    await get().saveSkill({
      ...draft,
      originalPath: null,
      scope: skill.scope === "repo" ? "repo" : "user",
      name,
      displayName: draft.displayName ? `${draft.displayName} Copy` : "",
    });
  },

  deleteSkill: async (skill) => {
    if (skill.scope === "system" || skill.scope === "admin") {
      throw new Error("System- und Admin-Skills können hier nicht gelöscht werden.");
    }
    if (basename(skill.path) !== "SKILL.md") throw new Error("Ungültiger Skill-Pfad.");
    const path = get().path;
    set({ busyKey: `skill:${skill.path}` });
    try {
      const backupPath = skillBackupPath(skill.path);
      await withControlClient(async (client) => {
        await client.createHostDirectory(dirname(backupPath));
        await client.copyHostPath(dirname(skill.path), backupPath);
        await client.removeHostPath(dirname(skill.path));
      });
      if (path) await get().load(path, true);
      return backupPath;
    } finally {
      set({ busyKey: null });
    }
  },

  saveMcpServer: async (draft, originalName) => {
    if (!/^[A-Za-z0-9_-]+$/u.test(draft.name)) {
      throw new Error("Der MCP-Name darf nur Buchstaben, Zahlen, _ und - enthalten.");
    }
    if (draft.transport === "http" && !/^https?:\/\//u.test(draft.url.trim())) {
      throw new Error("Für HTTP-MCP ist eine gültige http(s)-URL erforderlich.");
    }
    if (draft.transport === "stdio" && !draft.command.trim()) {
      throw new Error("Für STDIO-MCP ist ein Startbefehl erforderlich.");
    }
    set({ busyKey: `mcp:${draft.name}` });
    try {
      await withControlClient(async (client) => {
        await client.writeConfigValue(`mcp_servers.${configKeySegment(draft.name)}`, mcpConfigFromDraft(draft));
        if (originalName && originalName !== draft.name) {
          await client.writeConfigValue(`mcp_servers.${configKeySegment(originalName)}`, null, "replace");
        }
        await client.reloadMcpServers();
      });
      const path = get().path;
      if (path) await get().load(path, true);
    } finally {
      set({ busyKey: null });
    }
  },

  setMcpServerEnabled: async (serverName, enabled) => {
    set({ busyKey: `mcp:${serverName}` });
    try {
      await withControlClient(async (client) => {
        await client.writeConfigValue(`mcp_servers.${configKeySegment(serverName)}.enabled`, enabled);
        await client.reloadMcpServers();
      });
      set((state) => ({
        mcpServers: state.mcpServers.map((server) => server.name === serverName
          ? { ...server, config: { ...(server.config ?? {}), enabled } }
          : server),
      }));
    } finally {
      set({ busyKey: null });
    }
  },

  setMcpToolPolicy: async (serverName, toolName, enabled, approvalMode = "auto") => {
    set({ busyKey: `mcp:${serverName}:${toolName}` });
    try {
      const serverConfig = get().mcpServers.find((server) => server.name === serverName)?.config ?? {};
      const configuredAllowlist = stringValues(serverConfig.enabled_tools);
      const configuredDenylist = stringValues(serverConfig.disabled_tools);
      const enabledTools = enabled && configuredAllowlist.length
        ? [...new Set([...configuredAllowlist, toolName])]
        : configuredAllowlist.filter((candidate) => candidate !== toolName);
      const disabledTools = enabled
        ? configuredDenylist.filter((candidate) => candidate !== toolName)
        : [...new Set([...configuredDenylist, toolName])];
      await withControlClient(async (client) => {
        await client.writeConfigBatch([
          {
            keyPath: `mcp_servers.${configKeySegment(serverName)}.enabled_tools`,
            value: enabledTools.length ? enabledTools : null,
            mergeStrategy: "upsert",
          },
          {
            keyPath: `mcp_servers.${configKeySegment(serverName)}.disabled_tools`,
            value: disabledTools.length ? disabledTools : null,
            mergeStrategy: "upsert",
          },
          {
            keyPath: `mcp_servers.${configKeySegment(serverName)}.tools.${configKeySegment(toolName)}.approval_mode`,
            value: approvalMode,
            mergeStrategy: "upsert",
          },
        ]);
        await client.reloadMcpServers();
      });
      const path = get().path;
      if (path) await get().load(path, true);
    } finally {
      set({ busyKey: null });
    }
  },

  deleteMcpServer: async (serverName) => {
    set({ busyKey: `mcp:${serverName}` });
    try {
      await withControlClient(async (client) => {
        await client.writeConfigValue(`mcp_servers.${configKeySegment(serverName)}`, null, "replace");
        await client.reloadMcpServers();
      });
      const path = get().path;
      if (path) await get().load(path, true);
    } finally {
      set({ busyKey: null });
    }
  },

  loginMcpServer: async (serverName) => withControlClient(async (client) => (
    await client.loginMcpServer(serverName)
  ).authorizationUrl),

  readPlugin: async (plugin) => {
    const cached = get().pluginDetails[plugin.id];
    if (cached) return cached;
    set({ busyKey: `plugin:${plugin.id}:read` });
    try {
      const detail = await withControlClient(async (client) => (await client.readPlugin(plugin)).plugin);
      const normalized = {
        ...detail,
        summary: { ...detail.summary, marketplaceName: plugin.marketplaceName, marketplacePath: plugin.marketplacePath },
      };
      set((state) => ({ pluginDetails: { ...state.pluginDetails, [plugin.id]: normalized } }));
      return normalized;
    } finally {
      set({ busyKey: null });
    }
  },

  installPlugin: async (plugin) => {
    set({ busyKey: `plugin:${plugin.id}` });
    try {
      const response = await withControlClient((client) => client.installPlugin(plugin));
      const path = get().path;
      if (path) await get().load(path, true);
      return response.appsNeedingAuth.map((app) => app.name);
    } finally {
      set({ busyKey: null });
    }
  },

  uninstallPlugin: async (plugin) => {
    set({ busyKey: `plugin:${plugin.id}` });
    try {
      await withControlClient((client) => client.uninstallPlugin(plugin.id));
      const path = get().path;
      if (path) await get().load(path, true);
    } finally {
      set({ busyKey: null });
    }
  },

  setPluginEnabled: async (plugin, enabled) => {
    set({ busyKey: `plugin:${plugin.id}` });
    try {
      await withControlClient((client) => client.writeConfigValue(`plugins.${configKeySegment(plugin.id)}.enabled`, enabled));
      set((state) => ({
        marketplaces: state.marketplaces.map((marketplace) => ({
          ...marketplace,
          plugins: marketplace.plugins.map((item) => item.id === plugin.id ? { ...item, enabled } : item),
        })),
      }));
    } finally {
      set({ busyKey: null });
    }
  },

  setPluginMcpEnabled: async (pluginId, serverName, enabled) => {
    set({ busyKey: `plugin:${pluginId}:mcp:${serverName}` });
    try {
      await withControlClient(async (client) => {
        await client.writeConfigValue(
          `plugins.${configKeySegment(pluginId)}.mcp_servers.${configKeySegment(serverName)}.enabled`,
          enabled,
        );
        await client.reloadMcpServers();
      });
      const path = get().path;
      if (path) await get().load(path, true);
    } finally {
      set({ busyKey: null });
    }
  },

  setPluginMcpToolPolicy: async (pluginId, serverName, toolName, enabled, approvalMode) => {
    set({ busyKey: `plugin:${pluginId}:mcp:${serverName}:${toolName}` });
    try {
      const pluginsValue = get().config?.config.plugins;
      const pluginsConfig: Record<string, unknown> = isRecord(pluginsValue) ? pluginsValue : {};
      const pluginConfig: Record<string, unknown> = isRecord(pluginsConfig[pluginId]) ? pluginsConfig[pluginId] : {};
      const serversConfig: Record<string, unknown> = isRecord(pluginConfig.mcp_servers) ? pluginConfig.mcp_servers : {};
      const serverConfig: Record<string, unknown> = isRecord(serversConfig[serverName]) ? serversConfig[serverName] : {};
      const configuredAllowlist = stringValues(serverConfig.enabled_tools);
      const configuredDenylist = stringValues(serverConfig.disabled_tools);
      const enabledTools = enabled && configuredAllowlist.length
        ? [...new Set([...configuredAllowlist, toolName])]
        : configuredAllowlist.filter((candidate) => candidate !== toolName);
      const disabledTools = enabled
        ? configuredDenylist.filter((candidate) => candidate !== toolName)
        : [...new Set([...configuredDenylist, toolName])];
      await withControlClient(async (client) => {
        const serverPrefix = `plugins.${configKeySegment(pluginId)}.mcp_servers.${configKeySegment(serverName)}`;
        const prefix = `${serverPrefix}.tools.${configKeySegment(toolName)}`;
        await client.writeConfigBatch([
          { keyPath: `${serverPrefix}.enabled_tools`, value: enabledTools.length ? enabledTools : null, mergeStrategy: "upsert" },
          { keyPath: `${serverPrefix}.disabled_tools`, value: disabledTools.length ? disabledTools : null, mergeStrategy: "upsert" },
          { keyPath: `${prefix}.approval_mode`, value: approvalMode, mergeStrategy: "upsert" },
        ]);
        await client.reloadMcpServers();
      });
      const path = get().path;
      if (path) await get().load(path, true);
    } finally {
      set({ busyKey: null });
    }
  },

  addMarketplace: async (source, refName, sparsePaths) => {
    if (!source.trim()) throw new Error("Eine Marketplace-Quelle ist erforderlich.");
    set({ busyKey: "marketplace:add" });
    try {
      await withControlClient((client) => client.addMarketplace(source.trim(), refName, sparsePaths));
      const path = get().path;
      if (path) await get().load(path, true);
    } finally {
      set({ busyKey: null });
    }
  },

  removeMarketplace: async (name) => {
    set({ busyKey: `marketplace:${name}` });
    try {
      await withControlClient((client) => client.removeMarketplace(name));
      const path = get().path;
      if (path) await get().load(path, true);
    } finally {
      set({ busyKey: null });
    }
  },

  upgradeMarketplace: async (name) => {
    set({ busyKey: `marketplace:${name ?? "all"}` });
    try {
      await withControlClient((client) => client.upgradeMarketplace(name));
      const path = get().path;
      if (path) await get().load(path, true);
    } finally {
      set({ busyKey: null });
    }
  },

  setAppEnabled: async (app, enabled) => {
    set({ busyKey: `app:${app.id}` });
    try {
      await withControlClient((client) => client.writeConfigValue(`apps.${configKeySegment(app.id)}.enabled`, enabled));
      set((state) => ({
        apps: state.apps.map((item) => item.id === app.id
          ? {
              ...item,
              isEnabled: enabled,
              runtime: item.runtime ? { ...item.runtime, enabled, callable: enabled && item.runtime.callable } : null,
            }
          : item),
      }));
    } finally {
      set({ busyKey: null });
    }
  },

  updateAppPolicy: async (appId, edits) => {
    set({ busyKey: `app:${appId}:policy` });
    try {
      const configEdits: AgentConfigEdit[] = edits.map((edit) => ({
        keyPath: `apps.${configKeySegment(appId)}.${edit.key}`,
        value: edit.value,
        mergeStrategy: "upsert",
      }));
      await withControlClient((client) => client.writeConfigBatch(configEdits));
      const path = get().path;
      if (path) await get().load(path, true);
    } finally {
      set({ busyKey: null });
    }
  },

  updateAppToolPolicy: async (appId, toolName, enabled, approvalMode) => {
    set({ busyKey: `app:${appId}:${toolName}` });
    try {
      await withControlClient((client) => client.writeConfigBatch([
        {
          keyPath: `apps.${configKeySegment(appId)}.tools.${configKeySegment(toolName)}.enabled`,
          value: enabled,
          mergeStrategy: "upsert",
        },
        {
          keyPath: `apps.${configKeySegment(appId)}.tools.${configKeySegment(toolName)}.approval_mode`,
          value: approvalMode,
          mergeStrategy: "upsert",
        },
      ]));
      const path = get().path;
      if (path) await get().load(path, true);
    } finally {
      set({ busyKey: null });
    }
  },
}));

export function capabilityPlugins(marketplaces: AgentCapabilityMarketplace[]): AgentCapabilityPlugin[] {
  return marketplaces.flatMap((marketplace) => marketplace.plugins);
}

export function emptyMcpServerDraft(): AgentMcpServerDraft {
  return {
    baseConfig: {},
    name: "",
    transport: "http",
    enabled: true,
    required: false,
    command: "",
    args: [],
    cwd: "",
    env: [],
    envVars: [],
    remoteEnvVars: [],
    url: "",
    bearerTokenEnvVar: "",
    auth: "oauth",
    oauthResource: "",
    httpHeaders: [],
    envHttpHeaders: [],
    startupTimeoutSec: 10,
    toolTimeoutSec: 60,
    enabledTools: [],
    disabledTools: [],
    scopes: [],
    defaultApprovalMode: "auto",
    experimentalEnvironment: "local",
  };
}

export function mcpServerDraft(server: AgentCapabilityMcpServer): AgentMcpServerDraft {
  const config = server.config ?? {};
  const stringArray = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  const pairArray = (value: unknown): Array<{ key: string; value: string }> => isRecord(value)
    ? Object.entries(value).map(([key, item]) => ({ key, value: String(item ?? "") }))
    : [];
  const envVarNames = (value: unknown, source: "local" | "remote"): string[] => Array.isArray(value)
    ? value.flatMap((item) => {
        if (typeof item === "string") return source === "local" ? [item] : [];
        if (!isRecord(item) || typeof item.name !== "string") return [];
        const itemSource = item.source === "remote" ? "remote" : "local";
        return itemSource === source ? [item.name] : [];
      })
    : [];
  return {
    ...emptyMcpServerDraft(),
    baseConfig: { ...config },
    name: server.name,
    transport: typeof config.url === "string" ? "http" : "stdio",
    enabled: config.enabled !== false,
    required: config.required === true,
    command: typeof config.command === "string" ? config.command : "",
    args: stringArray(config.args),
    cwd: typeof config.cwd === "string" ? config.cwd : "",
    env: pairArray(config.env),
    envVars: envVarNames(config.env_vars, "local"),
    remoteEnvVars: envVarNames(config.env_vars, "remote"),
    url: typeof config.url === "string" ? config.url : "",
    bearerTokenEnvVar: typeof config.bearer_token_env_var === "string" ? config.bearer_token_env_var : "",
    auth: config.auth === "chatgpt" ? "chatgpt" : "oauth",
    oauthResource: typeof config.oauth_resource === "string" ? config.oauth_resource : "",
    httpHeaders: pairArray(config.http_headers),
    envHttpHeaders: pairArray(config.env_http_headers),
    startupTimeoutSec: numberValue(config.startup_timeout_sec, 10),
    toolTimeoutSec: numberValue(config.tool_timeout_sec, 60),
    enabledTools: stringArray(config.enabled_tools),
    disabledTools: stringArray(config.disabled_tools),
    scopes: stringArray(config.scopes),
    defaultApprovalMode: config.default_tools_approval_mode === "prompt" || config.default_tools_approval_mode === "writes" || config.default_tools_approval_mode === "approve" ? config.default_tools_approval_mode : "auto",
    experimentalEnvironment: config.experimental_environment === "remote" ? "remote" : "local",
  };
}

export function emptySkillDraft(): AgentSkillDraft {
  return {
    originalPath: null,
    scope: "repo",
    name: "",
    description: "",
    instructions: "# Workflow\n\n1. Describe the steps this skill should follow.",
    displayName: "",
    shortDescription: "",
    iconSmall: "",
    iconLarge: "",
    brandColor: "#10A37F",
    defaultPrompt: "",
    allowImplicitInvocation: true,
    products: ["CODEX"],
    dependencies: [],
  };
}
