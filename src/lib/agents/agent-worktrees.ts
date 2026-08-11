import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AgentWorktree {
  path: string;
  basePath: string;
  branch: string;
  createdAt: number;
}

export function worktreeSlug(name?: string, now: () => number = Date.now): string {
  const base = (name ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40);
  return base || `agent-${now().toString(36)}`;
}

export function worktreeTargetPath(repoPath: string, slug: string): string {
  const normalized = repoPath.replace(/[\\/]+$/u, "");
  const separator = normalized.includes("\\") ? "\\" : "/";
  return `${normalized}.worktrees${separator}${slug}`;
}

export function worktreeDisplayName(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

interface AgentWorktreeState {
  worktrees: Record<string, AgentWorktree>;
  createWorktree: (basePath: string, name?: string) => Promise<AgentWorktree>;
  removeWorktree: (path: string, options?: { force?: boolean }) => Promise<void>;
}

export const useAgentWorktreeStore = create<AgentWorktreeState>()(
  persist(
    (set, get) => ({
      worktrees: {},
      createWorktree: async (basePath, name) => {
        const base = basePath.trim();
        if (!base) throw new Error("Ein Worktree benötigt ein Basis-Repository.");
        const slug = worktreeSlug(name);
        const path = worktreeTargetPath(base, slug);
        if (get().worktrees[path]) throw new Error(`Worktree ${slug} existiert bereits.`);
        const branch = `agents/${slug}`;
        await invoke("git_worktree_add", {
          path: base,
          worktreePath: path,
          branch: null,
          newBranch: branch,
        });
        const entry: AgentWorktree = { path, basePath: base, branch, createdAt: Date.now() };
        set((state) => ({ worktrees: { ...state.worktrees, [path]: entry } }));
        return entry;
      },
      removeWorktree: async (path, options) => {
        const entry = get().worktrees[path];
        if (entry) {
          await invoke("git_worktree_remove", {
            path: entry.basePath,
            worktreePath: path,
            force: options?.force ?? false,
          });
        }
        set((state) => {
          const worktrees = { ...state.worktrees };
          delete worktrees[path];
          return { worktrees };
        });
      },
    }),
    { name: "l8git-agent-worktrees" },
  ),
);
