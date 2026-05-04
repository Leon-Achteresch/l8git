import {
  ContextMenuCheckboxItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import {
  useWorkspacePrefs,
  type PushForceMode,
  type PushTagsMode,
} from "@/lib/workspace-prefs";
import { invoke } from "@tauri-apps/api/core";
import {
  ChartPie,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  CloudDownload,
  Code2,
  FolderOpen,
  Link,
  Loader2,
  SquareTerminal,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { EditRemoteDialog } from "./edit-remote-dialog";
import { PushUpstreamDialog } from "./push-upstream-dialog";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";
import { ToolbarGroup } from "./toolbar-group";
import { RepoLanguageStats } from "@/components/repo/tabs/repo-language-stats";

type RemoteOp = "fetch" | "pull" | "push";

const SPINNER_DELAY_MS = 200;

export function RepoRemoteToolbar({ path }: { path: string }) {
  const reload = useRepoStore((s) => s.reload);
  const reloadStatus = useRepoStore((s) => s.reloadStatus);
  const pullCount = useRepoStore((s) => s.upstreamSync[path]?.behind ?? 0);
  const pushCount = useRepoStore((s) => s.upstreamSync[path]?.ahead ?? 0);
  const lackUpstream = useRepoStore((s) => s.hasUpstream[path] === false);
  const branch = useRepoStore((s) => s.repos[path]?.branch ?? "");
  const searchCommits = useRepoStore((s) => s.searchCommits);
  const clearCommitSearch = useRepoStore((s) => s.clearCommitSearch);
  const searchSlice = useRepoStore((s) => s.commitSearchByPath[path]);
  const activePath = useRepoStore((s) => s.activePath);
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const requestCommitSearchMatchStep = useUiStore(
    (s) => s.requestCommitSearchMatchStep,
  );
  const ideLaunchCommand = useWorkspacePrefs((s) => s.ideLaunchCommand);
  const repoTerminalKind = useWorkspacePrefs((s) => s.repoTerminalKind);
  const fetchPruneBranches = useWorkspacePrefs((s) => s.fetchPruneBranches);
  const setFetchPruneBranches = useWorkspacePrefs(
    (s) => s.setFetchPruneBranches,
  );
  const fetchPruneTags = useWorkspacePrefs((s) => s.fetchPruneTags);
  const setFetchPruneTags = useWorkspacePrefs((s) => s.setFetchPruneTags);
  const pushForceMode = useWorkspacePrefs((s) => s.pushForceMode);
  const setPushForceMode = useWorkspacePrefs((s) => s.setPushForceMode);
  const pushTagsMode = useWorkspacePrefs((s) => s.pushTagsMode);
  const setPushTagsMode = useWorkspacePrefs((s) => s.setPushTagsMode);
  const pushAtomic = useWorkspacePrefs((s) => s.pushAtomic);
  const setPushAtomic = useWorkspacePrefs((s) => s.setPushAtomic);
  const pushNoVerify = useWorkspacePrefs((s) => s.pushNoVerify);
  const setPushNoVerify = useWorkspacePrefs((s) => s.setPushNoVerify);
  const pushDryRun = useWorkspacePrefs((s) => s.pushDryRun);
  const setPushDryRun = useWorkspacePrefs((s) => s.setPushDryRun);
  const [busy, setBusy] = useState<RemoteOp | null>(null);
  const [showSpinner, setShowSpinner] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [draftQuery, setDraftQuery] = useState("");

  useEffect(() => {
    setDraftQuery("");
    clearCommitSearch(path);
  }, [path, clearCommitSearch]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void searchCommits(path, draftQuery);
    }, 320);
    return () => window.clearTimeout(t);
  }, [draftQuery, path, searchCommits]);

  useEffect(() => {
    if (!busy) return;
    const id = window.setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => {
      window.clearTimeout(id);
      setShowSpinner(false);
    };
  }, [busy]);

  useEffect(() => {
    void reloadStatus(path);
  }, [path, reloadStatus]);

  const run = useCallback(
    async (op: RemoteOp) => {
      setBusy(op);
      try {
        const out =
          op === "fetch"
            ? await invoke<string>("git_fetch", {
                path,
                pruneBranches: fetchPruneBranches,
                pruneTags: fetchPruneTags,
              })
            : op === "pull"
              ? await invoke<string>("git_pull", { path })
              : await invoke<string>("git_push", {
                  path,
                  setUpstream: false,
                  forceMode: pushForceMode === "none" ? null : pushForceMode,
                  tagsMode: pushTagsMode === "none" ? null : pushTagsMode,
                  atomic: pushAtomic,
                  noVerify: pushNoVerify,
                  dryRun: pushDryRun,
                });
        await Promise.all([reload(path), reloadStatus(path)]);
        toast.success(out.trim() || "Aktion erfolgreich abgeschlossen.");
      } catch (e) {
        toastError(String(e));
      } finally {
        setBusy(null);
      }
    },
    [
      path,
      reload,
      reloadStatus,
      fetchPruneBranches,
      fetchPruneTags,
      pushForceMode,
      pushTagsMode,
      pushAtomic,
      pushNoVerify,
      pushDryRun,
    ],
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
      await invoke("open_repo_terminal", {
        path,
        useGitBash: repoTerminalKind === "git_bash",
      });
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

  const fetchMenu = (
    <>
      <ContextMenuLabel>Beim Fetch löschen</ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuCheckboxItem
        checked={fetchPruneBranches}
        onCheckedChange={(v) => setFetchPruneBranches(!!v)}
        onSelect={(e) => e.preventDefault()}
      >
        Entfernte Zweige löschen
      </ContextMenuCheckboxItem>
      <ContextMenuCheckboxItem
        checked={fetchPruneTags}
        onCheckedChange={(v) => setFetchPruneTags(!!v)}
        onSelect={(e) => e.preventDefault()}
      >
        Entfernte Tags löschen
      </ContextMenuCheckboxItem>
    </>
  );

  const pushMenu = (
    <>
      <ContextMenuLabel>Force</ContextMenuLabel>
      <ContextMenuRadioGroup
        value={pushForceMode}
        onValueChange={(v) => setPushForceMode(v as PushForceMode)}
      >
        <ContextMenuRadioItem value="none" onSelect={(e) => e.preventDefault()}>
          Kein Force
        </ContextMenuRadioItem>
        <ContextMenuRadioItem
          value="lease"
          onSelect={(e) => e.preventDefault()}
        >
          Mit Lease erzwingen (--force-with-lease)
        </ContextMenuRadioItem>
        <ContextMenuRadioItem
          value="force"
          onSelect={(e) => e.preventDefault()}
        >
          Hart erzwingen (--force)
        </ContextMenuRadioItem>
      </ContextMenuRadioGroup>
      <ContextMenuSeparator />
      <ContextMenuLabel>Tags</ContextMenuLabel>
      <ContextMenuRadioGroup
        value={pushTagsMode}
        onValueChange={(v) => setPushTagsMode(v as PushTagsMode)}
      >
        <ContextMenuRadioItem value="none" onSelect={(e) => e.preventDefault()}>
          Keine Tags pushen
        </ContextMenuRadioItem>
        <ContextMenuRadioItem
          value="follow"
          onSelect={(e) => e.preventDefault()}
        >
          Erreichbare Tags (--follow-tags)
        </ContextMenuRadioItem>
        <ContextMenuRadioItem value="all" onSelect={(e) => e.preventDefault()}>
          Alle Tags (--tags)
        </ContextMenuRadioItem>
      </ContextMenuRadioGroup>
      <ContextMenuSeparator />
      <ContextMenuLabel>Optionen</ContextMenuLabel>
      <ContextMenuCheckboxItem
        checked={pushAtomic}
        onCheckedChange={(v) => setPushAtomic(!!v)}
        onSelect={(e) => e.preventDefault()}
      >
        Atomar (--atomic)
      </ContextMenuCheckboxItem>
      <ContextMenuCheckboxItem
        checked={pushNoVerify}
        onCheckedChange={(v) => setPushNoVerify(!!v)}
        onSelect={(e) => e.preventDefault()}
      >
        Pre-Push-Hooks überspringen (--no-verify)
      </ContextMenuCheckboxItem>
      <ContextMenuCheckboxItem
        checked={pushDryRun}
        onCheckedChange={(v) => setPushDryRun(!!v)}
        onSelect={(e) => e.preventDefault()}
      >
        Testlauf (--dry-run)
      </ContextMenuCheckboxItem>
    </>
  );

  const pushTitleParts: string[] = [];
  if (pushCount > 0) pushTitleParts.push(`${pushCount} ausstehend`);
  if (pushForceMode === "lease") pushTitleParts.push("Force-with-lease");
  else if (pushForceMode === "force") pushTitleParts.push("Force");
  if (pushTagsMode === "follow") pushTitleParts.push("follow-tags");
  else if (pushTagsMode === "all") pushTitleParts.push("--tags");
  if (pushDryRun) pushTitleParts.push("Dry-Run");
  const pushTitle =
    pushTitleParts.length > 0
      ? `Änderungen hochladen (${pushTitleParts.join(", ")})`
      : "Änderungen hochladen";

  const hasSearchHits = (searchSlice?.hits?.length ?? 0) > 0;
  const canStepSearchMatches =
    !!draftQuery.trim() &&
    hasSearchHits &&
    sidebarTab === "history" &&
    activePath === path;

  return (
    <>
    <div className="flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-2 pb-2 pt-1">
      <div className="flex min-w-0 flex-1 flex-wrap items-center">
        <ToolbarGroup>
          <ToolbarButton
            title="Änderungen abrufen (Rechtsklick für Optionen)"
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
            contextMenuContent={fetchMenu}
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
            title={`${pushTitle} (Rechtsklick für Optionen)`}
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
            contextMenuContent={pushMenu}
          />
          <ToolbarButton
            title="Remote-URL bearbeiten"
            label="Remote"
            onClick={() => setRemoteDialogOpen(true)}
            icon={<Link className="h-3.5 w-3.5" />}
          />
        </ToolbarGroup>

        <ToolbarDivider />

        <ToolbarGroup>
          <ToolbarButton
            title="Sprachen anzeigen"
            label="Sprachen"
            onClick={() => setLangOpen(true)}
            icon={<ChartPie className="h-3.5 w-3.5" />}
          />
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
      <div className="flex w-full max-w-sm shrink-0 items-start gap-1 sm:w-auto sm:min-w-[12rem]">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Input
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            placeholder="Commits durchsuchen …"
            spellCheck={false}
            autoComplete="off"
            aria-label="Commit-Suche"
            className="h-8"
          />
          {searchSlice?.loading &&
          searchSlice.query.trim() &&
          searchSlice.hits.length === 0 ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              Suche …
            </span>
          ) : null}
          {!searchSlice?.loading &&
          searchSlice?.query?.trim() &&
          searchSlice.hits.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              Keine Treffer.
            </span>
          ) : null}
        </div>
        {draftQuery.trim() ? (
          <div className="flex h-8 w-[1.375rem] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xs">
            <Button
              type="button"
              variant="ghost"
              className="h-0 min-h-0 flex-1 rounded-none border-0 p-0 shadow-none hover:bg-muted/80"
              disabled={!canStepSearchMatches}
              title="Vorheriger Treffer"
              aria-label="Vorheriger Suchtreffer"
              onClick={() => requestCommitSearchMatchStep(path, "prev")}
            >
              <ChevronUp className="size-2.5" strokeWidth={2.25} />
            </Button>
            <div className="h-px shrink-0 bg-border" aria-hidden />
            <Button
              type="button"
              variant="ghost"
              className="h-0 min-h-0 flex-1 rounded-none border-0 p-0 shadow-none hover:bg-muted/80"
              disabled={!canStepSearchMatches}
              title="Nächster Treffer"
              aria-label="Nächster Suchtreffer"
              onClick={() => requestCommitSearchMatchStep(path, "next")}
            >
              <ChevronDown className="size-2.5" strokeWidth={2.25} />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
    <PushUpstreamDialog
      open={pushDialogOpen}
      onClose={() => setPushDialogOpen(false)}
      path={path}
      branch={branch}
    />
    <EditRemoteDialog
      open={remoteDialogOpen}
      onClose={() => setRemoteDialogOpen(false)}
      path={path}
    />
    <RepoLanguageStats
      open={langOpen}
      path={path}
      onClose={() => setLangOpen(false)}
    />
    </>
  );
}
