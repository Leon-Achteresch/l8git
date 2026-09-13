import { create } from "zustand";

import type { AgentMcpServerDraft } from "@/lib/agents/capability-types";
import { invoke } from "@/lib/platform/ipc";

export type ContextFileScope = "repo" | "user" | "project-rules" | "memory";

export interface ContextFileEntry {
  path: string;
  scope: ContextFileScope;
  label: string;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    const { access } = await import("node:fs/promises");
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function listContextFiles(
  repoRoot: string,
  configDir: string,
): Promise<ContextFileEntry[]> {
  const { readdir } = await import("node:fs/promises");
  const entries: ContextFileEntry[] = [];

  const repoClaudeMd = `${repoRoot.replace(/\/+$/u, "")}/CLAUDE.md`;
  if (await pathExists(repoClaudeMd)) {
    entries.push({ path: repoClaudeMd, scope: "repo", label: "CLAUDE.md (repo)" });
  }

  const trimmedConfigDir = configDir.replace(/\/+$/u, "");
  const userClaudeMd = `${trimmedConfigDir}/CLAUDE.md`;
  if (await pathExists(userClaudeMd)) {
    entries.push({ path: userClaudeMd, scope: "user", label: "CLAUDE.md (user)" });
  }

  const rulesDir = `${trimmedConfigDir}/rules`;
  if (await pathExists(rulesDir)) {
    try {
      const files = await readdir(rulesDir);
      for (const file of files) {
        if (!file.toLocaleLowerCase().endsWith(".md")) continue;
        entries.push({
          path: `${rulesDir}/${file}`,
          scope: "project-rules",
          label: `rules/${file}`,
        });
      }
    } catch {
    }
  }

  const memoryDir = `${trimmedConfigDir}/memory`;
  if (await pathExists(memoryDir)) {
    try {
      const files = await readdir(memoryDir);
      for (const file of files) {
        if (!file.toLocaleLowerCase().endsWith(".md")) continue;
        entries.push({
          path: `${memoryDir}/${file}`,
          scope: "memory",
          label: `memory/${file}`,
        });
      }
    } catch {
    }
  }

  return entries;
}

/** Ebenen, auf denen eine CLI ihre Capabilities ablegt. */
export const CAPABILITY_SCOPES = ["global", "user", "repo"] as const;
export type CapabilityScope = (typeof CAPABILITY_SCOPES)[number];

export const CAPABILITY_KINDS = ["skill", "command", "agent", "mcp", "hook"] as const;
export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

export interface CapabilityScopeInfo {
  scope: CapabilityScope;
  root: string | null;
  exists: boolean;
  writable: boolean;
  itemCount: number;
}

export interface CapabilityTargetInfo {
  cli: string;
  label: string;
  command: string;
  installed: boolean;
  kinds: CapabilityKind[];
  scopes: CapabilityScopeInfo[];
}

export interface CapabilityItem {
  id: string;
  cli: string;
  scope: CapabilityScope;
  kind: CapabilityKind;
  name: string;
  rel: string;
  description: string;
  path: string;
  isDirectory: boolean;
  fileCount: number;
  sizeBytes: number;
  updatedAtMs: number;
  fingerprint: string;
}

export interface CapabilityInventory {
  targets: CapabilityTargetInfo[];
  items: CapabilityItem[];
  warnings: string[];
}

export interface CapabilityRef {
  cli: string;
  scope: CapabilityScope;
  kind: CapabilityKind;
  rel: string;
}

export interface CapabilityTargetRef {
  cli: string;
  scope: CapabilityScope;
}

export type CapabilityOpStatus =
  | "copied"
  | "deleted"
  | "installed"
  | "skipped"
  | "unsupported"
  | "error";

export interface CapabilityOpResult {
  kind: string;
  name: string;
  source: string;
  target: string;
  status: CapabilityOpStatus;
  message: string;
  path: string | null;
  backup: string | null;
}

export type CapabilityPlanAction = "create" | "update" | "same" | "extra" | "unsupported";

export interface CapabilityPlanEntry {
  kind: CapabilityKind;
  name: string;
  rel: string;
  sourceCli: string;
  sourceScope: CapabilityScope;
  targetCli: string;
  targetScope: CapabilityScope;
  action: CapabilityPlanAction;
  detail: string;
}

export function targetKey(target: CapabilityTargetRef): string {
  return `${target.cli}:${target.scope}`;
}

export function itemRef(item: CapabilityItem): CapabilityRef {
  return { cli: item.cli, scope: item.scope, kind: item.kind, rel: item.rel };
}

export function scopeInfo(
  target: CapabilityTargetInfo | undefined,
  scope: CapabilityScope,
): CapabilityScopeInfo | undefined {
  return target?.scopes.find((entry) => entry.scope === scope);
}

/** Ein Ziel ist wählbar, wenn die Ebene beschreibbar ist. */
export function targetWritable(
  targets: CapabilityTargetInfo[],
  target: CapabilityTargetRef,
): boolean {
  const info = targets.find((entry) => entry.cli === target.cli);
  return scopeInfo(info, target.scope)?.writable ?? false;
}

export function targetSupports(
  targets: CapabilityTargetInfo[],
  cli: string,
  kind: CapabilityKind,
): boolean {
  return targets.find((entry) => entry.cli === cli)?.kinds.includes(kind) ?? false;
}

/**
 * Vergleichsschlüssel, der die Dateinamens-Konventionen der CLIs ausblendet –
 * spiegelt `match_key` in `capability_sync.rs`, damit die Anzeige und der
 * serverseitige Abgleich dieselben Einträge als „gleich" behandeln.
 */
export function matchKey(kind: CapabilityKind, rel: string): string {
  if (kind === "skill") {
    return rel.replace(/\.md$/u, "").replace(/\/$/u, "").toLocaleLowerCase();
  }
  if (kind === "command" || kind === "agent") {
    return rel
      .replace(/\.prompt\.md$|\.md$|\.mdc$|\.toml$/u, "")
      .replace(/\//gu, ":")
      .toLocaleLowerCase();
  }
  return rel.toLocaleLowerCase();
}

/** Was ein Kopieren dieses Eintrags in dieses Ziel bewirken würde. */
export type CapabilityItemStatus = "missing" | "same" | "different" | "unsupported";

export function itemStatusForTarget(
  item: CapabilityItem,
  target: CapabilityTargetRef,
  targets: CapabilityTargetInfo[],
  items: CapabilityItem[],
): CapabilityItemStatus {
  if (!targetSupports(targets, target.cli, item.kind)) return "unsupported";
  const key = matchKey(item.kind, item.rel);
  const existing = items.find(
    (candidate) =>
      candidate.cli === target.cli &&
      candidate.scope === target.scope &&
      candidate.kind === item.kind &&
      matchKey(candidate.kind, candidate.rel) === key,
  );
  if (!existing) return "missing";
  return existing.fingerprint === item.fingerprint ? "same" : "different";
}

/** Zählt die Ziel-Zustände eines Eintrags über alle gewählten Ziele. */
export function itemStatusSummary(
  item: CapabilityItem,
  selected: CapabilityTargetRef[],
  targets: CapabilityTargetInfo[],
  items: CapabilityItem[],
): Record<CapabilityItemStatus, number> {
  const totals: Record<CapabilityItemStatus, number> = {
    missing: 0,
    same: 0,
    different: 0,
    unsupported: 0,
  };
  for (const target of selected) {
    totals[itemStatusForTarget(item, target, targets, items)] += 1;
  }
  return totals;
}

export function preferredWritableScope(target: CapabilityTargetInfo): CapabilityScope {
  const ranked = [...(target.scopes ?? [])]
    .filter((scope) => scope.writable)
    .sort((a, b) => b.itemCount - a.itemCount);
  return ranked[0]?.scope ?? "user";
}

export function defaultTargets(
  infos: CapabilityTargetInfo[],
  source: CapabilityTargetRef | null,
): CapabilityTargetRef[] {
  return infos.flatMap((info) => {
    if (source && info.cli === source.cli) return [];
    const scope = source?.scope ?? preferredWritableScope(info);
    const reference: CapabilityTargetRef = { cli: info.cli, scope };
    return targetWritable(infos, reference) ? [reference] : [];
  });
}

export function presenceColumns(
  infos: CapabilityTargetInfo[],
  selected: CapabilityTargetRef[],
  source: CapabilityTargetRef | null,
): CapabilityTargetRef[] {
  return infos.map((info) => {
    const picked = selected.find((entry) => entry.cli === info.cli);
    if (picked) return picked;
    if (source?.cli === info.cli) return source;
    return { cli: info.cli, scope: preferredWritableScope(info) };
  });
}

export function kindCountsForCli(
  items: CapabilityItem[],
  cli: string,
  kinds: readonly CapabilityKind[] = CAPABILITY_KINDS,
): Record<CapabilityKind, number> {
  const counts = {
    skill: 0,
    command: 0,
    agent: 0,
    mcp: 0,
    hook: 0,
  } satisfies Record<CapabilityKind, number>;
  for (const item of items) {
    if (item.cli !== cli || !kinds.includes(item.kind)) continue;
    counts[item.kind] += 1;
  }
  return counts;
}

export function gapsToward(
  items: CapabilityItem[],
  source: CapabilityTargetRef,
  target: CapabilityTargetRef,
  infos: CapabilityTargetInfo[],
  kinds: readonly CapabilityKind[],
): { missing: CapabilityItem[]; different: CapabilityItem[] } {
  const missing: CapabilityItem[] = [];
  const different: CapabilityItem[] = [];
  for (const item of items) {
    if (item.cli !== source.cli || item.scope !== source.scope || !kinds.includes(item.kind)) continue;
    const status = itemStatusForTarget(item, target, infos, items);
    if (status === "missing") missing.push(item);
    else if (status === "different") different.push(item);
  }
  return { missing, different };
}

export function coverageSummary(
  items: CapabilityItem[],
  source: CapabilityTargetRef,
  selected: CapabilityTargetRef[],
  infos: CapabilityTargetInfo[],
  kinds: readonly CapabilityKind[],
): { missing: number; different: number; same: number; unsupported: number; total: number } {
  let missing = 0;
  let different = 0;
  let same = 0;
  let unsupported = 0;
  let total = 0;
  for (const item of items) {
    if (item.cli !== source.cli || item.scope !== source.scope || !kinds.includes(item.kind)) continue;
    total += 1;
    const totals = itemStatusSummary(item, selected, infos, items);
    if (totals.missing) missing += 1;
    else if (totals.different) different += 1;
    else if (totals.same) same += 1;
    else unsupported += 1;
  }
  return { missing, different, same, unsupported, total };
}

export function assetLocalPresence(
  name: string,
  kind: CapabilityKind,
  items: CapabilityItem[],
): string[] {
  const key = matchKey(kind, name);
  const clis = new Set<string>();
  for (const item of items) {
    if (item.kind !== kind) continue;
    if (matchKey(item.kind, item.rel) === key || matchKey(item.kind, item.name) === key) {
      clis.add(item.cli);
    }
  }
  return [...clis];
}

export function summarizeResults(results: CapabilityOpResult[]): {
  ok: number;
  skipped: number;
  failed: number;
} {
  return results.reduce(
    (totals, entry) => ({
      ok: totals.ok + (entry.status === "error" || entry.status === "skipped" || entry.status === "unsupported" ? 0 : 1),
      skipped: totals.skipped + (entry.status === "skipped" || entry.status === "unsupported" ? 1 : 0),
      failed: totals.failed + (entry.status === "error" ? 1 : 0),
    }),
    { ok: 0, skipped: 0, failed: 0 },
  );
}

export interface McpLiveServer {
  name: string;
  tools: string[];
  authStatus: string;
}

export type McpInventoryStatus = "connected" | "error" | "unconfigured";

export interface McpInventoryEntry {
  cli: string;
  scope: CapabilityScope;
  name: string;
  configured: boolean;
  status: McpInventoryStatus;
  tools: string[];
  authStatus: string | null;
}

export function mergeMcpToolCatalog(
  items: CapabilityItem[],
  liveServers: McpLiveServer[],
  target: CapabilityTargetRef,
): McpInventoryEntry[] {
  const liveByName = new Map(liveServers.map((server) => [server.name, server]));
  const configured = items.filter(
    (item) => item.kind === "mcp" && item.cli === target.cli && item.scope === target.scope,
  );
  const entries: McpInventoryEntry[] = configured.map((item) => {
    const live = liveByName.get(item.name);
    return {
      cli: item.cli,
      scope: item.scope,
      name: item.name,
      configured: true,
      status: live ? (live.authStatus === "error" ? "error" : "connected") : "unconfigured",
      tools: live?.tools ?? [],
      authStatus: live?.authStatus ?? null,
    };
  });
  const configuredNames = new Set(configured.map((item) => item.name));
  for (const server of liveServers) {
    if (configuredNames.has(server.name)) continue;
    entries.push({
      cli: target.cli,
      scope: target.scope,
      name: server.name,
      configured: false,
      status: server.authStatus === "error" ? "error" : "connected",
      tools: server.tools,
      authStatus: server.authStatus,
    });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

const SECRET_REF_PREFIX = "secret:";

export function validateMcpServerDraft(draft: AgentMcpServerDraft): string[] {
  const issues: string[] = [];
  if (!/^[A-Za-z0-9_-]+$/u.test(draft.name.trim())) {
    issues.push("Der MCP-Name darf nur Buchstaben, Zahlen, _ und - enthalten.");
  }
  if (draft.transport === "http") {
    if (!/^https?:\/\//u.test(draft.url.trim())) {
      issues.push("Für HTTP-MCP ist eine gültige http(s)-URL erforderlich.");
    }
  } else if (draft.transport === "stdio") {
    if (!draft.command.trim()) {
      issues.push("Für STDIO-MCP ist ein Startbefehl erforderlich.");
    }
    if (draft.args.some((arg) => typeof arg !== "string" || arg.length === 0)) {
      issues.push("Ein Startargument ist leer oder ungültig.");
    }
  } else {
    issues.push("Unbekannter Transport.");
  }
  for (const entry of draft.env) {
    if (!entry.value.startsWith(SECRET_REF_PREFIX)) continue;
    const key = entry.value.slice(SECRET_REF_PREFIX.length).trim();
    if (!key) {
      issues.push(`Der Secret-Verweis für ${entry.key.trim() || "einen Umgebungswert"} ist leer.`);
    }
  }
  return issues;
}

export type McpAuthState = "needsAuth" | "authorizing" | "authorized";

export interface McpOAuthState {
  status: McpAuthState;
  requestId: number;
}

export const INITIAL_MCP_OAUTH_STATE: McpOAuthState = { status: "needsAuth", requestId: 0 };

export type McpOAuthEvent = "start" | "authorized" | "cancel";

/**
 * OAuth-Statusübergänge als reine Funktion: jeder Start erhöht `requestId`,
 * damit eine spät eintreffende Antwort auf eine bereits abgebrochene/erneut
 * gestartete Anfrage erkannt und verworfen werden kann (siehe `respondsToRequest`).
 */
export function nextMcpOAuthState(
  current: McpOAuthState | undefined,
  event: McpOAuthEvent,
): McpOAuthState {
  const base = current ?? INITIAL_MCP_OAUTH_STATE;
  if (event === "start") return { status: "authorizing", requestId: base.requestId + 1 };
  if (event === "cancel") return { status: "needsAuth", requestId: base.requestId + 1 };
  return { status: "authorized", requestId: base.requestId };
}

/** Ob eine ausstehende OAuth-Antwort noch zur aktuellen Anfrage gehört. */
export function respondsToRequest(current: McpOAuthState | undefined, requestId: number): boolean {
  return (current ?? INITIAL_MCP_OAUTH_STATE).requestId === requestId;
}

/**
 * Ein Tool-Aufruf braucht einen Reconnect, wenn die Konfiguration geändert
 * wurde, während (oder nachdem) der zuletzt gestartete Tool-Lauf begann.
 */
export function mcpReconnectRequired(
  toolRunningSinceMs: number | null,
  configChangedAtMs: number | null,
): boolean {
  if (toolRunningSinceMs === null || configChangedAtMs === null) return false;
  return configChangedAtMs > toolRunningSinceMs;
}

interface CapabilityHubState {
  path: string | null;
  loading: boolean;
  busy: boolean;
  loadedAt: number | null;
  error: string | null;
  inventory: CapabilityInventory;
  load: (path: string, force?: boolean) => Promise<void>;
  copy: (
    items: CapabilityRef[],
    targets: CapabilityTargetRef[],
    overwrite: boolean,
  ) => Promise<CapabilityOpResult[]>;
  remove: (items: CapabilityRef[]) => Promise<CapabilityOpResult[]>;
  plan: (
    source: CapabilityTargetRef,
    targets: CapabilityTargetRef[],
    kinds: CapabilityKind[],
    includeExtras: boolean,
  ) => Promise<CapabilityPlanEntry[]>;
  apply: (
    entries: CapabilityPlanEntry[],
    deleteExtras: boolean,
  ) => Promise<CapabilityOpResult[]>;
}

const EMPTY_INVENTORY: CapabilityInventory = { targets: [], items: [], warnings: [] };
const inflight = new Map<string, Promise<void>>();

export const useCapabilityHubStore = create<CapabilityHubState>((set, get) => ({
  path: null,
  loading: false,
  busy: false,
  loadedAt: null,
  error: null,
  inventory: EMPTY_INVENTORY,

  load: async (path, force = false) => {
    const state = get();
    if (!force && state.path === path && state.loadedAt && Date.now() - state.loadedAt < 15_000) {
      return;
    }
    const pending = inflight.get(path);
    if (pending) return pending;
    const request = (async () => {
      set({ loading: true, error: null });
      try {
        const inventory = await invoke<CapabilityInventory>("agent_cap_inventory", { path });
        set({
          inventory: {
            targets: inventory.targets ?? [],
            items: inventory.items ?? [],
            warnings: inventory.warnings ?? [],
          },
          path,
          loadedAt: Date.now(),
          loading: false,
        });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          inventory: EMPTY_INVENTORY,
          path,
          loadedAt: Date.now(),
        });
      } finally {
        inflight.delete(path);
      }
    })();
    inflight.set(path, request);
    return request;
  },

  copy: async (items, targets, overwrite) => {
    const path = get().path;
    if (!path) return [];
    set({ busy: true });
    try {
      const results = await invoke<CapabilityOpResult[]>("agent_cap_copy", {
        path,
        items,
        targets,
        overwrite,
      });
      await get().load(path, true);
      return results;
    } finally {
      set({ busy: false });
    }
  },

  remove: async (items) => {
    const path = get().path;
    if (!path) return [];
    set({ busy: true });
    try {
      const results = await invoke<CapabilityOpResult[]>("agent_cap_delete", { path, items });
      await get().load(path, true);
      return results;
    } finally {
      set({ busy: false });
    }
  },

  plan: async (source, targets, kinds, includeExtras) => {
    const path = get().path;
    if (!path) return [];
    set({ busy: true });
    try {
      return await invoke<CapabilityPlanEntry[]>("agent_cap_sync_plan", {
        path,
        source,
        targets,
        kinds,
        includeExtras,
      });
    } finally {
      set({ busy: false });
    }
  },

  apply: async (entries, deleteExtras) => {
    const path = get().path;
    if (!path) return [];
    set({ busy: true });
    try {
      const results = await invoke<CapabilityOpResult[]>("agent_cap_sync_apply", {
        path,
        entries,
        deleteExtras,
      });
      await get().load(path, true);
      return results;
    } finally {
      set({ busy: false });
    }
  },
}));

export interface ParsedSkillFrontmatter {
  name?: string;
  description?: string;
  allowedTools?: string[];
  model?: string;
  error?: string;
}

function splitFrontmatterList(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function parseSkillFrontmatter(md: string): ParsedSkillFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(md.trimStart());
  if (!match) {
    return { error: "missing frontmatter" };
  }
  const block = match[1];
  const lines = block.split(/\r?\n/);
  const result: ParsedSkillFrontmatter = {};
  const listBuffer: string[] = [];
  let listKey: "allowedTools" | null = null;

  const flushList = () => {
    if (listKey === "allowedTools" && listBuffer.length > 0) {
      result.allowedTools = [...listBuffer];
    }
    listBuffer.length = 0;
    listKey = null;
  };

  for (const line of lines) {
    const listItem = /^\s*-\s*(.+)$/.exec(line);
    if (listItem && listKey) {
      listBuffer.push(listItem[1].trim());
      continue;
    }
    flushList();
    const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase();
    const value = kv[2].trim();
    if (key === "name") {
      result.name = value;
    } else if (key === "description") {
      result.description = value;
    } else if (key === "model") {
      result.model = value;
    } else if (key === "allowed-tools" || key === "allowedtools") {
      if (value.length > 0) {
        result.allowedTools = splitFrontmatterList(value);
      } else {
        listKey = "allowedTools";
      }
    }
  }
  flushList();

  if (!result.name && !result.description) {
    return { ...result, error: "malformed frontmatter" };
  }
  return result;
}

export interface SkillOverrideEntry {
  name: string;
  scope: "project" | "user" | "plugin";
  [key: string]: unknown;
}

const SKILL_SCOPE_PRIORITY: Record<SkillOverrideEntry["scope"], number> = {
  project: 0,
  user: 1,
  plugin: 2,
};

export function resolveSkillOverrides<T extends SkillOverrideEntry>(
  entries: T[],
): Array<T & { overriddenBy?: string }> {
  const byName = new Map<string, T>();
  for (const entry of entries) {
    const existing = byName.get(entry.name);
    if (!existing || SKILL_SCOPE_PRIORITY[entry.scope] < SKILL_SCOPE_PRIORITY[existing.scope]) {
      byName.set(entry.name, entry);
    }
  }
  return entries.map((entry) => {
    const winner = byName.get(entry.name);
    if (
      !winner ||
      winner === entry ||
      SKILL_SCOPE_PRIORITY[entry.scope] <= SKILL_SCOPE_PRIORITY[winner.scope]
    ) {
      return { ...entry };
    }
    return { ...entry, overriddenBy: winner.scope };
  });
}

export interface InvokableSkillRef {
  name: string;
  enabled: boolean;
  allowImplicitInvocation?: boolean;
}

export interface ResolvedSkillInvocation {
  skill: InvokableSkillRef;
  args: string;
  attachments: string[];
  manualOnly: boolean;
}

const SKILL_INVOCATION_PATTERN = /^\/([A-Za-z0-9][\w-]*)(?:\s+([\s\S]*))?$/u;
const MENTION_PATTERN = /(?<=^|\s)@([^\s@]+)/gu;

export function resolveSkillInvocation<T extends InvokableSkillRef>(
  input: string,
  skills: T[],
): { skill: T; args: string; attachments: string[]; manualOnly: boolean } | { error: string } {
  const trimmed = input.trim();
  const match = SKILL_INVOCATION_PATTERN.exec(trimmed);
  if (!match) {
    return { error: "input is not a skill invocation" };
  }
  const name = match[1];
  const rest = match[2] ?? "";
  const skill = skills.find((entry) => entry.name === name);
  if (!skill) {
    return { error: `unknown skill: ${name}` };
  }
  if (!skill.enabled) {
    return { error: `skill is disabled: ${name}` };
  }
  const attachments: string[] = [];
  const args = rest
    .replace(MENTION_PATTERN, (_full, raw: string) => {
      attachments.push(raw);
      return "";
    })
    .replace(/\s+/gu, " ")
    .trim();
  return {
    skill,
    args,
    attachments,
    manualOnly: skill.allowImplicitInvocation === false,
  };
}

export interface DispatchableSkillRef {
  name: string;
  enabled: boolean;
  frontmatter?: ParsedSkillFrontmatter;
}

export interface DispatchedSkillPrompt {
  prompt: string;
  attachments: string[];
  hints: string[];
}

export function dispatchSkill<T extends DispatchableSkillRef>(
  skill: T | undefined,
  args: string,
  attachments: string[],
): DispatchedSkillPrompt | { error: string } {
  if (!skill) {
    return { error: "unknown skill" };
  }
  if (!skill.enabled) {
    return { error: `skill is disabled: ${skill.name}` };
  }
  const trimmedArgs = args.trim();
  const prompt = trimmedArgs ? `/${skill.name} ${trimmedArgs}` : `/${skill.name}`;
  const hints: string[] = [];
  if (skill.frontmatter?.error) {
    hints.push(`frontmatter warning: ${skill.frontmatter.error}`);
  }
  if (skill.frontmatter?.description) {
    hints.push(skill.frontmatter.description);
  }
  if (skill.frontmatter?.allowedTools && skill.frontmatter.allowedTools.length > 0) {
    hints.push(`allowed-tools: ${skill.frontmatter.allowedTools.join(", ")}`);
  }
  return {
    prompt,
    attachments: [...attachments],
    hints,
  };
}
