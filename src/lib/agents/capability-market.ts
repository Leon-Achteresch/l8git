import { create } from "zustand";

import type { CapabilityOpResult, CapabilityTargetRef } from "@/lib/agents/capability-hub";
import { invoke } from "@/lib/platform/ipc";

export const MARKET_KINDS = ["skill", "mcp", "plugin", "hook", "command"] as const;
export type MarketKind = (typeof MARKET_KINDS)[number];

export const MARKET_SORTS = ["stars", "updated", "forks"] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];

export type MarketPopularity = "hot" | "popular" | "growing" | "fresh" | "small";

export interface MarketRepo {
  fullName: string;
  name: string;
  owner: string;
  avatarUrl: string;
  description: string;
  htmlUrl: string;
  homepage: string;
  stars: number;
  forks: number;
  openIssues: number;
  topics: string[];
  language: string;
  license: string;
  updatedAt: string;
  pushedAt: string;
  archived: boolean;
  defaultBranch: string;
  popularity: MarketPopularity;
  kind: string;
}

export interface MarketSearchResult {
  items: MarketRepo[];
  queries: string[];
  totalCount: number;
  authenticated: boolean;
  cached: boolean;
  rateLimited: boolean;
  notes: string[];
}

export type MarketAssetKind =
  | "skill"
  | "command"
  | "agent"
  | "mcp"
  | "hook"
  | "hookScript"
  | "pluginMarketplace";

export interface MarketAsset {
  kind: MarketAssetKind;
  name: string;
  path: string;
  description: string;
  fileCount: number;
}

export interface McpSpec {
  name: string;
  transport: "stdio" | "http";
  command: string | null;
  args: string[];
  env: Record<string, string>;
  url: string | null;
  headers: Record<string, string>;
  enabled: boolean;
}

export interface MarketDetail {
  repo: MarketRepo;
  refName: string;
  assets: MarketAsset[];
  readmeExcerpt: string;
  mcpSuggestion: McpSpec | null;
  truncated: boolean;
  cached: boolean;
}

/** Welche Capability-Art ein Marktplatz-Fund in der CLI belegt. */
export function assetTargetKind(kind: MarketAssetKind): "skill" | "command" | "agent" | "mcp" | "hook" {
  if (kind === "hookScript") return "hook";
  if (kind === "pluginMarketplace") return "mcp";
  return kind;
}

export function assetsFor(detail: MarketDetail | null, kind: MarketKind): MarketAsset[] {
  if (!detail) return [];
  const wanted: Record<MarketKind, MarketAssetKind[]> = {
    skill: ["skill"],
    mcp: ["mcp"],
    plugin: ["pluginMarketplace"],
    hook: ["hook", "hookScript"],
    command: ["command", "agent"],
  };
  const preferred = detail.assets.filter((asset) => wanted[kind].includes(asset.kind));
  return preferred.length ? preferred : detail.assets;
}

interface MarketState {
  kind: MarketKind;
  query: string;
  sort: MarketSort;
  minStars: number;
  loading: boolean;
  inspecting: boolean;
  installing: boolean;
  error: string | null;
  result: MarketSearchResult | null;
  detail: MarketDetail | null;
  setKind: (kind: MarketKind) => void;
  setQuery: (query: string) => void;
  setSort: (sort: MarketSort) => void;
  setMinStars: (minStars: number) => void;
  search: () => Promise<void>;
  inspect: (fullName: string, refName?: string) => Promise<MarketDetail | null>;
  clearDetail: () => void;
  install: (
    path: string,
    assets: MarketAsset[],
    targets: CapabilityTargetRef[],
    overwrite: boolean,
  ) => Promise<CapabilityOpResult[]>;
  addMcp: (
    path: string,
    spec: McpSpec,
    targets: CapabilityTargetRef[],
  ) => Promise<CapabilityOpResult[]>;
  preview: (fullName: string, refName: string, file: string) => Promise<string>;
}

export const useCapabilityMarketStore = create<MarketState>((set, get) => ({
  kind: "skill",
  query: "",
  sort: "stars",
  minStars: 0,
  loading: false,
  inspecting: false,
  installing: false,
  error: null,
  result: null,
  detail: null,

  setKind: (kind) => set({ kind, detail: null }),
  setQuery: (query) => set({ query }),
  setSort: (sort) => set({ sort }),
  setMinStars: (minStars) => set({ minStars }),
  clearDetail: () => set({ detail: null }),

  search: async () => {
    const { kind, query, sort, minStars } = get();
    set({ loading: true, error: null });
    try {
      const result = await invoke<MarketSearchResult>("agent_market_search", {
        kind,
        query,
        sort,
        minStars: minStars > 0 ? minStars : null,
      });
      set({ result, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  inspect: async (fullName, refName) => {
    set({ inspecting: true, error: null });
    try {
      const detail = await invoke<MarketDetail>("agent_market_inspect", {
        fullName,
        refName: refName ?? null,
      });
      set({ detail, inspecting: false });
      return detail;
    } catch (error) {
      set({
        inspecting: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  install: async (path, assets, targets, overwrite) => {
    const detail = get().detail;
    if (!detail) return [];
    set({ installing: true });
    try {
      return await invoke<CapabilityOpResult[]>("agent_market_install", {
        path,
        fullName: detail.repo.fullName,
        refName: detail.refName,
        assets,
        targets,
        overwrite,
      });
    } finally {
      set({ installing: false });
    }
  },

  addMcp: async (path, spec, targets) => {
    set({ installing: true });
    try {
      return await invoke<CapabilityOpResult[]>("agent_market_add_mcp", { path, spec, targets });
    } finally {
      set({ installing: false });
    }
  },

  preview: async (fullName, refName, file) =>
    invoke<string>("agent_market_preview", { fullName, refName, file }),
}));
