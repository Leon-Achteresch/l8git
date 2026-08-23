import { invoke } from "@/lib/platform/ipc";
import { platformStorage } from "@/lib/platform/kv";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
  landWorktree: (path: string) => Promise<string>;
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
      landWorktree: async (path) => {
        const entry = get().worktrees[path];
        if (!entry) throw new Error("Unbekannter Worktree.");
        const status = await invoke<unknown[]>("repo_status", { path });
        if (Array.isArray(status) && status.length > 0) {
          throw new Error(
            `Der Worktree hat ${status.length} nicht committete Änderungen. Bitte zuerst committen — zum Beispiel durch den Agent.`,
          );
        }
        let output: string;
        try {
          output = await invoke<string>("git_merge", {
            path: entry.basePath,
            branch: entry.branch,
            strategy: null,
            message: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes("__LOCAL_CHANGES_BLOCK__")) {
            throw new Error(
              "Das Basis-Repository hat lokale Änderungen. Bitte zuerst committen oder stashen.",
            );
          }
          throw new Error(message);
        }
        await invoke("git_worktree_remove", {
          path: entry.basePath,
          worktreePath: path,
          force: false,
        });
        await invoke("delete_branch", {
          path: entry.basePath,
          name: entry.branch,
          force: false,
        }).catch(() => {});
        set((state) => {
          const worktrees = { ...state.worktrees };
          delete worktrees[path];
          return { worktrees };
        });
        return output;
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
    { name: "l8git-agent-worktrees", storage: createJSONStorage(() => platformStorage) },
  ),
);
