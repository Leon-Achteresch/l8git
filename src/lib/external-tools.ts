import { invoke, isTauri } from "@tauri-apps/api/core";
import { toast } from "sonner";

import { toastError } from "@/lib/error-toast";
import i18n from "@/lib/i18n";
import { useRepoStore } from "@/lib/repo-store";

export type ToolOption = { name: string; available: boolean };

export type ExternalToolSettings = {
  diffTool: string | null;
  mergeTool: string | null;
  diffTools: ToolOption[];
  mergeTools: ToolOption[];
};

/** unstaged: worktree vs index · staged: index vs HEAD · commit: commit vs parent */
export type DiffToolTarget =
  | { mode: "unstaged" | "staged" }
  | { mode: "commit"; commit: string };

export const EXTERNAL_TOOLS_SETTINGS_HASH = "workspace";

/** The commands are local-only: GUI tools open on the machine running the app. */
export const externalToolsSupported = () => isTauri();

export function loadExternalToolSettings(): Promise<ExternalToolSettings> {
  return invoke<ExternalToolSettings>("git_external_tool_settings");
}

export function setExternalTool(kind: "diff" | "merge", tool: string | null): Promise<void> {
  return invoke("git_set_external_tool", { kind, tool });
}

function reportToolError(err: unknown) {
  const message = String(err);
  const missing = message.includes("__NO_DIFF_TOOL__")
    ? "externalTools.noDiffTool"
    : message.includes("__NO_MERGE_TOOL__")
      ? "externalTools.noMergeTool"
      : null;
  if (!missing) {
    toastError(message);
    return;
  }
  toast.info(i18n.t(missing), {
    action: {
      label: i18n.t("externalTools.openSettings"),
      onClick: () => {
        // Lazy: the router module imports the route tree, which imports this file's callers.
        void import("@/lib/router").then(({ router }) =>
          router.navigate({ to: "/settings", hash: EXTERNAL_TOOLS_SETTINGS_HASH }),
        );
      },
    },
  });
}

/** Resolves when the tool window closes; never blocks other git operations. */
export async function openExternalDiff(repoPath: string, file: string, target: DiffToolTarget) {
  try {
    await invoke("git_open_difftool", {
      path: repoPath,
      file,
      mode: target.mode,
      commit: target.mode === "commit" ? target.commit : null,
    });
  } catch (err) {
    reportToolError(err);
  }
}

/** Refreshes status once the tool exits so a resolved file shows as resolved. */
export async function openExternalMerge(repoPath: string, file: string): Promise<void> {
  try {
    await invoke("git_open_mergetool", { path: repoPath, file });
  } catch (err) {
    reportToolError(err);
  } finally {
    const store = useRepoStore.getState();
    await Promise.all([
      store.reloadStatus(repoPath),
      store.reloadMergeState(repoPath),
      store.reloadRebaseState(repoPath),
    ]).catch(() => undefined);
  }
}
