import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { create } from "zustand";

import { toastError } from "@/lib/error-toast";
import i18n from "@/lib/i18n";
import { useRepoStore } from "@/lib/repo-store";
import {
  EMPTY_RESTACK_STATE,
  EMPTY_STACK_LIST,
  stackRestackTargets,
  type Stack,
  type StackList,
  type StackRestackResult,
  type StackRestackState,
} from "@/lib/stack";

type StackStoreState = {
  lists: Record<string, StackList>;
  restackState: Record<string, StackRestackState>;
  loading: Record<string, boolean>;
  busy: Record<string, boolean>;
  error: Record<string, string | null>;
  load: (path: string) => Promise<void>;
  createBranch: (path: string, name: string, parent: string) => Promise<void>;
  adopt: (path: string, name: string, parent: string) => Promise<void>;
  remove: (path: string, name: string) => Promise<void>;
  suggestName: (path: string, base: string) => Promise<string>;
  restack: (path: string, branch: string) => Promise<StackRestackResult>;
  restackStack: (path: string, stack: Stack) => Promise<StackRestackResult[]>;
  resume: (path: string) => Promise<StackRestackResult | null>;
  syncRestackState: (path: string) => Promise<StackRestackState>;
  clear: (path: string) => void;
};

const resumeInFlight = new Set<string>();

async function refreshRepo(path: string) {
  const repo = useRepoStore.getState();
  await Promise.all([repo.reload(path), repo.reloadRebaseState(path)]);
}

export const useStackStore = create<StackStoreState>((set, get) => ({
  lists: {},
  restackState: {},
  loading: {},
  busy: {},
  error: {},

  load: async (path) => {
    if (!path) return;
    set((s) => ({ loading: { ...s.loading, [path]: true } }));
    try {
      const list = await invoke<StackList>("stack_list", { path });
      set((s) => ({
        lists: { ...s.lists, [path]: list },
        error: { ...s.error, [path]: null },
      }));
    } catch (e) {
      set((s) => ({
        lists: { ...s.lists, [path]: s.lists[path] ?? EMPTY_STACK_LIST },
        error: { ...s.error, [path]: String(e) },
      }));
    } finally {
      set((s) => ({ loading: { ...s.loading, [path]: false } }));
    }
  },

  createBranch: async (path, name, parent) => {
    const list = await invoke<StackList>("stack_create_branch", {
      path,
      name,
      parent,
    });
    set((s) => ({ lists: { ...s.lists, [path]: list } }));
    await refreshRepo(path);
  },

  adopt: async (path, name, parent) => {
    const list = await invoke<StackList>("stack_adopt", { path, name, parent });
    set((s) => ({ lists: { ...s.lists, [path]: list } }));
  },

  remove: async (path, name) => {
    const list = await invoke<StackList>("stack_remove", { path, name });
    set((s) => ({ lists: { ...s.lists, [path]: list } }));
  },

  suggestName: async (path, base) =>
    invoke<string>("stack_next_branch_name", { path, base }),

  restack: async (path, branch) => {
    set((s) => ({ busy: { ...s.busy, [path]: true } }));
    try {
      const result = await invoke<StackRestackResult>("stack_restack", {
        path,
        branch,
      });
      await refreshRepo(path);
      await Promise.all([get().load(path), get().syncRestackState(path)]);
      return result;
    } finally {
      set((s) => ({ busy: { ...s.busy, [path]: false } }));
    }
  },

  restackStack: async (path, stack) => {
    const results: StackRestackResult[] = [];
    for (const target of stackRestackTargets(stack)) {
      const result = await get().restack(path, target);
      results.push(result);
      if (result.status === "conflict") break;
    }
    return results;
  },

  resume: async (path) => {
    if (resumeInFlight.has(path)) return null;
    const state = await get().syncRestackState(path);
    if (!state.active || state.rebase_in_progress) return null;
    resumeInFlight.add(path);
    set((s) => ({ busy: { ...s.busy, [path]: true } }));
    try {
      const result = await invoke<StackRestackResult>("stack_restack_resume", {
        path,
      });
      await refreshRepo(path);
      await Promise.all([get().load(path), get().syncRestackState(path)]);
      return result;
    } finally {
      resumeInFlight.delete(path);
      set((s) => ({ busy: { ...s.busy, [path]: false } }));
    }
  },

  syncRestackState: async (path) => {
    try {
      const state = await invoke<StackRestackState>("stack_restack_state", {
        path,
      });
      set((s) => ({ restackState: { ...s.restackState, [path]: state } }));
      return state;
    } catch {
      set((s) => ({
        restackState: { ...s.restackState, [path]: EMPTY_RESTACK_STATE },
      }));
      return EMPTY_RESTACK_STATE;
    }
  },

  clear: (path) =>
    set((s) => {
      const lists = { ...s.lists };
      const restackState = { ...s.restackState };
      const loading = { ...s.loading };
      const busy = { ...s.busy };
      const error = { ...s.error };
      delete lists[path];
      delete restackState[path];
      delete loading[path];
      delete busy[path];
      delete error[path];
      return { lists, restackState, loading, busy, error };
    }),
}));

export function useStackRestackWatcher(path: string) {
  const rebaseInProgress = useRepoStore(
    (s) => s.rebaseState[path]?.in_progress ?? false,
  );
  const state = useStackStore((s) => s.restackState[path]);
  const busy = useStackStore((s) => s.busy[path] ?? false);
  const syncRestackState = useStackStore((s) => s.syncRestackState);
  const resume = useStackStore((s) => s.resume);
  const attempted = useRef<string>("");

  useEffect(() => {
    if (!path) return;
    void syncRestackState(path);
  }, [path, rebaseInProgress, syncRestackState]);

  useEffect(() => {
    if (!path || busy || rebaseInProgress) return;
    if (!state?.active || state.rebase_in_progress) return;
    const plan = state.plan;
    const key = [
      path,
      plan?.branch ?? "",
      plan?.done.length ?? 0,
      plan?.pending.length ?? 0,
      plan?.current?.branch ?? "",
    ].join("|");
    if (attempted.current === key) return;
    attempted.current = key;
    void resume(path)
      .then((result) => {
        if (!result) return;
        if (result.status === "conflict") {
          toast.info(
            i18n.t("stack.restackConflictToast", {
              branch: result.current?.branch ?? result.branch,
            }),
          );
          return;
        }
        if (result.restacked.length > 0) {
          toast.success(
            i18n.t("stack.restackDoneToast", { count: result.restacked.length }),
          );
        }
      })
      .catch((e) => toastError(String(e)));
  }, [path, state, busy, rebaseInProgress, resume]);
}
