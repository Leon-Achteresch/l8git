import { invoke } from "@/lib/platform/ipc";
import { platformStorage } from "@/lib/platform/kv";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { defaultInstanceId } from "@/lib/agents/storage-keys";

export interface AgentWorktree {
  path: string;
  basePath: string;
  branch: string;
  createdAt: number;
  instanceId?: string;
  pullRequestUrl?: string;
}

export interface ProjectDefaults {
  instanceId?: string;
  model?: string;
}

export interface WorktreeSessionOptions {
  cwd: string;
  instanceId: string;
  repoPath: string;
  model?: string;
}

export function worktreeSessionOptions(
  path: string,
  projectDefaults?: ProjectDefaults,
): WorktreeSessionOptions {
  const entry = useAgentWorktreeStore.getState().worktrees[path];
  if (!entry) {
    throw new Error(`Unbekannter Worktree: ${path}`);
  }
  return {
    cwd: entry.path,
    instanceId: entry.instanceId ?? projectDefaults?.instanceId ?? defaultInstanceId("claude"),
    repoPath: entry.basePath,
    model: projectDefaults?.model,
  };
}

const PULL_REQUEST_URL_PATTERN =
  /^https:\/\/[a-z0-9.-]+\/[^/\s]+\/[^/\s]+\/(pull|pulls|merge_requests)\/\d+\/?$/i;

export function isValidPullRequestUrl(url: string): boolean {
  return PULL_REQUEST_URL_PATTERN.test(url.trim());
}

export function linkPullRequest(path: string, url: string): void {
  const trimmed = url.trim();
  if (!isValidPullRequestUrl(trimmed)) {
    throw new Error(`Ungültige Pull-Request-URL: ${url}`);
  }
  useAgentWorktreeStore.setState((state) => {
    const entry = state.worktrees[path];
    if (!entry) return state;
    return {
      worktrees: {
        ...state.worktrees,
        [path]: { ...entry, pullRequestUrl: trimmed },
      },
    };
  });
}

export function unlinkPullRequest(path: string): void {
  useAgentWorktreeStore.setState((state) => {
    const entry = state.worktrees[path];
    if (!entry) return state;
    const { pullRequestUrl: _drop, ...rest } = entry;
    return { worktrees: { ...state.worktrees, [path]: rest } };
  });
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

export interface CheckpointFile {
  path: string;
  content: string | null;
}

export interface TurnCheckpoint {
  turnId: string;
  files: CheckpointFile[];
}

export function selectRestoreTargets(
  checkpoint: TurnCheckpoint,
  paths: readonly string[],
): CheckpointFile[] {
  const wanted = new Set(paths);
  return checkpoint.files.filter((file) => wanted.has(file.path));
}

export type FinishFlowStepId = "commit" | "merge" | "cleanup";

export interface FinishFlowStep {
  id: FinishFlowStepId;
  enabled: boolean;
}

export interface PlanFinishFlowOptions {
  commit: boolean;
  merge: boolean;
  cleanup: boolean;
}

export function planFinishFlow(
  worktree: AgentWorktree | null | undefined,
  options: PlanFinishFlowOptions,
  sessionBusy = false,
): FinishFlowStep[] {
  if (!worktree) return [];
  if (sessionBusy) {
    throw new Error("Der Worktree hat noch eine laufende Session. Bitte zuerst stoppen.");
  }
  const steps: FinishFlowStep[] = [];
  if (options.commit) steps.push({ id: "commit", enabled: true });
  if (options.merge) steps.push({ id: "merge", enabled: true });
  if (options.cleanup) steps.push({ id: "cleanup", enabled: true });
  return steps;
}

interface AgentWorktreeState {
  worktrees: Record<string, AgentWorktree>;
  createWorktree: (basePath: string, name?: string, instanceId?: string) => Promise<AgentWorktree>;
  removeWorktree: (path: string, options?: { force?: boolean }) => Promise<void>;
  landWorktree: (path: string) => Promise<string>;
}

export const useAgentWorktreeStore = create<AgentWorktreeState>()(
  persist(
    (set, get) => ({
      worktrees: {},
      createWorktree: async (basePath, name, instanceId) => {
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
        const entry: AgentWorktree = {
          path,
          basePath: base,
          branch,
          createdAt: Date.now(),
          instanceId: instanceId ?? defaultInstanceId("claude"),
        };
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
