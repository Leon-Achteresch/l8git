import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import {
  parseCleanupCandidates,
  type BranchCleanupCandidate,
} from "@/lib/branch-cleanup";
import { useRepoStore } from "@/lib/repo-store";

export type ArchiveRequest = {
  name: string;
  tip: string;
  remoteRef: string | null;
};

export type ArchivedRef = {
  name: string;
  hash: string;
};

export type ArchiveFailure = {
  name: string;
  error: string;
};

export type ArchiveResult = {
  archived: ArchivedRef[];
  failures: ArchiveFailure[];
  remoteFailures: ArchiveFailure[];
};

export type RestoreResult = {
  restored: string[];
  failures: ArchiveFailure[];
};

type BranchCleanupState = {
  candidates: Record<string, BranchCleanupCandidate[]>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  loadedAt: Record<string, number>;
  load: (path: string, staleDays: number) => Promise<void>;
  archive: (path: string, requests: readonly ArchiveRequest[]) => Promise<ArchiveResult>;
  restore: (path: string, refs: readonly ArchivedRef[]) => Promise<RestoreResult>;
  clear: (path: string) => void;
};

export const useBranchCleanupStore = create<BranchCleanupState>((set, get) => ({
  candidates: {},
  loading: {},
  error: {},
  loadedAt: {},

  load: async (path, staleDays) => {
    if (!path || get().loading[path]) return;
    set((s) => ({
      loading: { ...s.loading, [path]: true },
      error: { ...s.error, [path]: null },
    }));
    try {
      const raw = await invoke<unknown>("branch_cleanup_candidates", {
        path,
        staleDays,
      });
      const parsed = parseCleanupCandidates(raw);
      set((s) => ({
        candidates: { ...s.candidates, [path]: parsed },
        loadedAt: { ...s.loadedAt, [path]: Date.now() },
      }));
    } catch (e) {
      set((s) => ({
        candidates: { ...s.candidates, [path]: [] },
        error: { ...s.error, [path]: String(e) },
      }));
    } finally {
      set((s) => ({ loading: { ...s.loading, [path]: false } }));
    }
  },

  archive: async (path, requests) => {
    const archived: ArchivedRef[] = [];
    const failures: ArchiveFailure[] = [];
    const remoteFailures: ArchiveFailure[] = [];

    for (const req of requests) {
      try {
        await invoke("delete_branch", { path, name: req.name, force: true });
        archived.push({ name: req.name, hash: req.tip });
      } catch (e) {
        failures.push({ name: req.name, error: String(e) });
        continue;
      }
      if (!req.remoteRef) continue;
      try {
        await invoke<string>("delete_remote_branch", {
          path,
          remoteRef: req.remoteRef,
        });
      } catch (e) {
        remoteFailures.push({ name: req.remoteRef, error: String(e) });
      }
    }

    if (archived.length > 0) {
      set((s) => {
        const gone = new Set(archived.map((a) => a.name));
        return {
          candidates: {
            ...s.candidates,
            [path]: (s.candidates[path] ?? []).filter((c) => !gone.has(c.name)),
          },
        };
      });
      await useRepoStore.getState().reload(path);
    }

    return { archived, failures, remoteFailures };
  },

  restore: async (path, refs) => {
    const restored: string[] = [];
    const failures: ArchiveFailure[] = [];
    for (const ref of refs) {
      try {
        await invoke("branch_restore", { path, name: ref.name, hash: ref.hash });
        restored.push(ref.name);
      } catch (e) {
        failures.push({ name: ref.name, error: String(e) });
      }
    }
    if (restored.length > 0) await useRepoStore.getState().reload(path);
    return { restored, failures };
  },

  clear: (path) =>
    set((s) => {
      const candidates = { ...s.candidates };
      const loading = { ...s.loading };
      const error = { ...s.error };
      const loadedAt = { ...s.loadedAt };
      delete candidates[path];
      delete loading[path];
      delete error[path];
      delete loadedAt[path];
      return { candidates, loading, error, loadedAt };
    }),
}));
