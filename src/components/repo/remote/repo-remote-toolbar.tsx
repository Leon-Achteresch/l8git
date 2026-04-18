import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  CloudDownload,
  Code2,
  FolderOpen,
  Loader2,
  SquareTerminal,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PushUpstreamDialog } from "./push-upstream-dialog";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";
import { ToolbarGroup } from "./toolbar-group";

type RemoteOp = "fetch" | "pull" | "push";

const SPINNER_DELAY_MS = 200;

export function RepoRemoteToolbar({ path }: { path: string }) {
  const reload = useRepoStore((s) => s.reload);
  const reloadStatus = useRepoStore((s) => s.reloadStatus);
  const pullCount = useRepoStore((s) => s.upstreamSync[path]?.behind ?? 0);
  const pushCount = useRepoStore((s) => s.upstreamSync[path]?.ahead ?? 0);
  const lackUpstream = useRepoStore((s) => s.hasUpstream[path] === false);
  const branch = useRepoStore((s) => s.repos[path]?.branch ?? "");
  const ideLaunchCommand = useWorkspacePrefs((s) => s.ideLaunchCommand);
  const [busy, setBusy] = useState<RemoteOp | null>(null);
  const [showSpinner, setShowSpinner] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);

  useEffect(() => {
    if (!busy) return;
    const id = window.setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => {
      window.clearTimeout(id);
      setShowSpinner(false);
    };
  }, [busy]);

  const run = useCallback(
    async (op: RemoteOp) => {
      setBusy(op);
      try {
        const out =
          op === "fetch"
            ? await invoke<string>("git_fetch", { path })
            : op === "pull"
              ? await invoke<string>("git_pull", { path })
              : await invoke<string>("git_push", { path, setUpstream: false });
        await Promise.all([reload(path), reloadStatus(path)]);
        toast.success(out.trim() || "Aktion erfolgreich abgeschlossen.");
      } catch (e) {
        toastError(String(e));
      } finally {
        setBusy(null);
      }
    },
    [path, reload, reloadStatus],
  );

  const runPush = useCallback(() => {
    if (lackUpstream) {
      setPushDialogOpen(true);
      return;
    }
    void run("push");
  }, [lackUpstream, run]);

  const remoteDisabled = busy !== null;
  const ideConfigured = ideLaunchCommand.trim().length > 0;

  async function revealFolder() {
    try {
      await invoke("reveal_repo_folder", { path });
    } catch (e) {
      toastError(String(e));
    }
  }

  async function openTerminalHere() {
    try {
      await invoke("open_repo_terminal", { path });
    } catch (e) {
      toastError(String(e));
    }
  }

  async function openIdeHere() {
    const ide = ideLaunchCommand.trim();
    if (!ide) {
      toastError("Kein IDE-Befehl konfiguriert.");
      return;
    }
    try {
      await invoke("open_repo_in_ide", { path, ideLaunch: ide });
    } catch (e) {
      toastError(String(e));
    }
  }

  return (
    <>
    <div className="flex w-full items-center justify-between pb-2 pt-1">
      <div className="flex items-center">
        <ToolbarGroup>
          <ToolbarButton
            title="Änderungen abrufen"
            label="Fetch"
            disabled={remoteDisabled}
            isActive={busy === "fetch"}
            onClick={() => void run("fetch")}
            icon={
              busy === "fetch" && showSpinner ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CloudDownload className="h-3.5 w-3.5" />
              )
            }
          />
          <ToolbarButton
            title={
              pullCount > 0
                ? `Änderungen herunterladen (${pullCount} ausstehend)`
                : "Änderungen herunterladen"
            }
            label="Pull"
            badge={pullCount}
            disabled={remoteDisabled}
            isActive={busy === "pull"}
            onClick={() => void run("pull")}
            icon={
              busy === "pull" && showSpinner ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowDownToLine className="h-3.5 w-3.5" />
              )
            }
          />
          <ToolbarButton
            title={
              pushCount > 0
                ? `Änderungen hochladen (${pushCount} ausstehend)`
                : "Änderungen hochladen"
            }
            label="Push"
            badge={pushCount}
            disabled={remoteDisabled}
            isActive={busy === "push"}
            onClick={() => void runPush()}
            icon={
              busy === "push" && showSpinner ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowUpToLine className="h-3.5 w-3.5" />
              )
            }
          />
        </ToolbarGroup>

        <ToolbarDivider />

        <ToolbarGroup>
          <ToolbarButton
            title="Im Dateimanager öffnen"
            label="Dateien"
            onClick={() => void revealFolder()}
            icon={<FolderOpen className="h-3.5 w-3.5" />}
          />
          <ToolbarButton
            title="Terminal hier öffnen"
            label="Terminal"
            onClick={() => void openTerminalHere()}
            icon={<SquareTerminal className="h-3.5 w-3.5" />}
          />
          <ToolbarButton
            title={
              ideConfigured
                ? "In der IDE öffnen"
                : "IDE in den Einstellungen konfigurieren"
            }
            label="IDE"
            disabled={!ideConfigured}
            onClick={() => void openIdeHere()}
            icon={<Code2 className="h-3.5 w-3.5" />}
          />
        </ToolbarGroup>
      </div>
    </div>
    <PushUpstreamDialog
      open={pushDialogOpen}
      onClose={() => setPushDialogOpen(false)}
      path={path}
      branch={branch}
    />
    </>
  );
}
