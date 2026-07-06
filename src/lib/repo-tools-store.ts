import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

// Mirrors src-tauri/src/repo_tools.rs
export type ToolAction = {
  label: string;
  run: string;
  confirm?: boolean;
};

export type RepoTool = {
  name: string;
  requires?: string | null;
  actions: ToolAction[];
  available: boolean;
};

type RepoToolsState = {
  toolsByPath: Record<string, RepoTool[]>;
  loadTools: (path: string) => Promise<void>;
};

// Loads the repo's .l8git/tools.json manifest; shared by the sidebar panel and command palette.
export const useRepoToolsStore = create<RepoToolsState>((set) => ({
  toolsByPath: {},
  loadTools: async (path) => {
    try {
      const tools = await invoke<RepoTool[]>("list_repo_tools", { path });
      set((s) => ({ toolsByPath: { ...s.toolsByPath, [path]: tools } }));
    } catch {
      // A malformed manifest shouldn't break the UI — treat as no tools.
      set((s) => ({ toolsByPath: { ...s.toolsByPath, [path]: [] } }));
    }
  },
}));
