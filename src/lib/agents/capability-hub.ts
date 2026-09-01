import { create } from "zustand";

import { invoke } from "@/lib/platform/ipc";

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
  const ranked = [...target.scopes]
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
        set({ inventory, path, loadedAt: Date.now(), loading: false });
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
