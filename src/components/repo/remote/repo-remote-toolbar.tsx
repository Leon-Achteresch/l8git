import { BranchMultiSelect } from '@/components/repo/commit/branch-multi-select';
import { Button } from '@/components/ui/button';
import {
  ContextMenuCheckboxItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { toastError } from '@/lib/error-toast';
import { useRepoStore } from '@/lib/repo-store';
import { useUiStore } from '@/lib/ui-store';
import {
  useWorkspacePrefs,
  type PushForceMode,
  type PushTagsMode,
} from '@/lib/workspace-prefs';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  CloudDownload,
  Code2,
  FolderOpen,
  Link,
  Loader2,
  ScanSearch,
  SquareTerminal,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EditRemoteDialog } from './edit-remote-dialog';
import { PushUpstreamDialog } from './push-upstream-dialog';
import { ToolbarButton } from './toolbar-button';
import { ToolbarDivider } from './toolbar-divider';
import { ToolbarGroup } from './toolbar-group';

type RemoteOp = 'fetch' | 'pull' | 'push';

const SPINNER_DELAY_MS = 200;
const EMPTY_BRANCH_FILTER: ReadonlySet<string> = new Set();

export function RepoRemoteToolbar({ path }: { path: string }) {
  const { t } = useTranslation();
  const reload = useRepoStore(s => s.reload);
  const reloadStatus = useRepoStore(s => s.reloadStatus);
  const pullCount = useRepoStore(s => s.upstreamSync[path]?.behind ?? 0);
  const pushCount = useRepoStore(s => s.upstreamSync[path]?.ahead ?? 0);
  const lackUpstream = useRepoStore(s => s.hasUpstream[path] === false);
  const branch = useRepoStore(s => s.repos[path]?.branch ?? '');
  const branches = useRepoStore(s => s.repos[path]?.branches ?? []);
  const searchCommits = useRepoStore(s => s.searchCommits);
  const clearCommitSearch = useRepoStore(s => s.clearCommitSearch);
  const searchSlice = useRepoStore(s => s.commitSearchByPath[path]);
  const activePath = useRepoStore(s => s.activePath);
  const sidebarTab = useUiStore(s => s.sidebarTab);
  const requestCommitSearchMatchStep = useUiStore(
    s => s.requestCommitSearchMatchStep
  );
  const branchFilter =
    useUiStore(s => s.branchFilterByPath[path]) ?? EMPTY_BRANCH_FILTER;
  const setBranchFilter = useUiStore(s => s.setBranchFilter);
  const bisect = useRepoStore(s => s.bisect[path]);
  const bisectVisible = useUiStore(s => s.bisectVisible);
  const setBisectVisible = useUiStore(s => s.setBisectVisible);
  const ideLaunchCommand = useWorkspacePrefs(s => s.ideLaunchCommand);
  const repoTerminalKind = useWorkspacePrefs(s => s.repoTerminalKind);
  const fetchPruneBranches = useWorkspacePrefs(s => s.fetchPruneBranches);
  const setFetchPruneBranches = useWorkspacePrefs(s => s.setFetchPruneBranches);
  const fetchPruneTags = useWorkspacePrefs(s => s.fetchPruneTags);
  const setFetchPruneTags = useWorkspacePrefs(s => s.setFetchPruneTags);
  const pushForceMode = useWorkspacePrefs(s => s.pushForceMode);
  const setPushForceMode = useWorkspacePrefs(s => s.setPushForceMode);
  const pushTagsMode = useWorkspacePrefs(s => s.pushTagsMode);
  const setPushTagsMode = useWorkspacePrefs(s => s.setPushTagsMode);
  const pushAtomic = useWorkspacePrefs(s => s.pushAtomic);
  const setPushAtomic = useWorkspacePrefs(s => s.setPushAtomic);
  const pushNoVerify = useWorkspacePrefs(s => s.pushNoVerify);
  const setPushNoVerify = useWorkspacePrefs(s => s.setPushNoVerify);
  const pushDryRun = useWorkspacePrefs(s => s.pushDryRun);
  const setPushDryRun = useWorkspacePrefs(s => s.setPushDryRun);
  const [busy, setBusy] = useState<RemoteOp | null>(null);
  const [showSpinner, setShowSpinner] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
  const [draftQuery, setDraftQuery] = useState('');

  useEffect(() => {
    setDraftQuery('');
    clearCommitSearch(path);
  }, [path, clearCommitSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchCommits(path, draftQuery);
    }, 320);
    return () => window.clearTimeout(timer);
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
          op === 'fetch'
            ? await invoke<string>('git_fetch', {
                path,
                pruneBranches: fetchPruneBranches,
                pruneTags: fetchPruneTags,
              })
            : op === 'pull'
              ? await invoke<string>('git_pull', { path })
              : await invoke<string>('git_push', {
                  path,
                  setUpstream: false,
                  forceMode: pushForceMode === 'none' ? null : pushForceMode,
                  tagsMode: pushTagsMode === 'none' ? null : pushTagsMode,
                  atomic: pushAtomic,
                  noVerify: pushNoVerify,
                  dryRun: pushDryRun,
                });
        await Promise.all([reload(path), reloadStatus(path)]);
        toast.success(out.trim() || t("toolbar.actionSuccess"));
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
      t,
    ]
  );

  const runPush = useCallback(() => {
    if (lackUpstream) {
      setPushDialogOpen(true);
      return;
    }
    void run('push');
  }, [lackUpstream, run]);

  const remoteDisabled = busy !== null;
  const ideConfigured = ideLaunchCommand.trim().length > 0;

  async function revealFolder() {
    try {
      await invoke('reveal_repo_folder', { path });
    } catch (e) {
      toastError(String(e));
    }
  }

  async function openTerminalHere() {
    try {
      await invoke('open_repo_terminal', {
        path,
        useGitBash: repoTerminalKind === 'git_bash',
      });
    } catch (e) {
      toastError(String(e));
    }
  }

  async function openIdeHere() {
    const ide = ideLaunchCommand.trim();
    if (!ide) {
      toastError(t("toolbar.noIdeCommand"));
      return;
    }
    try {
      await invoke('open_repo_in_ide', { path, ideLaunch: ide });
    } catch (e) {
      toastError(String(e));
    }
  }

  const fetchMenu = useMemo(
    () => (
      <>
        <ContextMenuLabel>{t("toolbar.fetchPruneSection")}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem
          checked={fetchPruneBranches}
          onCheckedChange={(v) => setFetchPruneBranches(!!v)}
          onSelect={(e) => e.preventDefault()}
        >
          {t("toolbar.fetchPruneBranches")}
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={fetchPruneTags}
          onCheckedChange={(v) => setFetchPruneTags(!!v)}
          onSelect={(e) => e.preventDefault()}
        >
          {t("toolbar.fetchPruneTags")}
        </ContextMenuCheckboxItem>
      </>
    ),
    [fetchPruneBranches, fetchPruneTags, setFetchPruneBranches, setFetchPruneTags, t],
  );

  const pushMenu = useMemo(
    () => (
      <>
        <ContextMenuLabel>{t("toolbar.pushForceSection")}</ContextMenuLabel>
        <ContextMenuRadioGroup value={pushForceMode} onValueChange={(v) => setPushForceMode(v as PushForceMode)}>
          <ContextMenuRadioItem value="none" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.noForcePush")}
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value="lease" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.forceLeaseOption")}
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value="force" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.forceHardOption")}
          </ContextMenuRadioItem>
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuLabel>{t("toolbar.pushTagsSection")}</ContextMenuLabel>
        <ContextMenuRadioGroup value={pushTagsMode} onValueChange={(v) => setPushTagsMode(v as PushTagsMode)}>
          <ContextMenuRadioItem value="none" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.noTagsPush")}
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value="follow" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.pushTagsReachable")}
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value="all" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.pushTagsAllOption")}
          </ContextMenuRadioItem>
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuLabel>{t("toolbar.pushOptionsSection")}</ContextMenuLabel>
        <ContextMenuCheckboxItem
          checked={pushAtomic}
          onCheckedChange={(v) => setPushAtomic(!!v)}
          onSelect={(e) => e.preventDefault()}
        >
          {t("toolbar.atomicOption")}
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={pushNoVerify}
          onCheckedChange={(v) => setPushNoVerify(!!v)}
          onSelect={(e) => e.preventDefault()}
        >
          {t("toolbar.skipPrePushHooks")}
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={pushDryRun}
          onCheckedChange={(v) => setPushDryRun(!!v)}
          onSelect={(e) => e.preventDefault()}
        >
          {t("toolbar.dryRunOption")}
        </ContextMenuCheckboxItem>
      </>
    ),
    [
      pushAtomic,
      pushDryRun,
      pushForceMode,
      pushNoVerify,
      pushTagsMode,
      setPushAtomic,
      setPushDryRun,
      setPushForceMode,
      setPushNoVerify,
      setPushTagsMode,
      t,
    ],
  );

  const pushTitle = useMemo(() => {
    const parts: string[] = [];
    if (pushCount > 0) parts.push(t("toolbar.pendingSuffix", { count: pushCount }));
    if (pushForceMode === "lease") parts.push(t("toolbar.forceWithLease"));
    else if (pushForceMode === "force") parts.push(t("toolbar.force"));
    if (pushTagsMode === "follow") parts.push(t("toolbar.followTags"));
    else if (pushTagsMode === "all") parts.push(t("toolbar.allTags"));
    if (pushDryRun) parts.push(t("toolbar.dryRun"));
    return parts.length > 0 ? t("toolbar.pushWithOptions", { parts: parts.join(", ") }) : t("toolbar.pushNormal");
  }, [
    pushCount,
    pushDryRun,
    pushForceMode,
    pushTagsMode,
    t,
  ]);

  const bisectToolbarTitle = useMemo(() => {
    if (!bisect?.active) return t("toolbar.bisectToggleTitle");
    const stepsPart =
      bisect.steps_remaining != null ? t("toolbar.bisectSteps", { count: bisect.steps_remaining }) : "";
    return t("toolbar.bisectRunningTitle", { steps: stepsPart });
  }, [bisect?.active, bisect?.steps_remaining, t]);

  const hasSearchHits = (searchSlice?.hits?.length ?? 0) > 0;
  const canStepSearchMatches =
    !!draftQuery.trim() &&
    hasSearchHits &&
    sidebarTab === 'history' &&
    activePath === path;

  return (
    <>
      <div className='flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-2 pb-2 pt-1'>
        <div className='flex min-w-0 flex-1 flex-wrap items-center'>
          <ToolbarGroup>
            <ToolbarButton
              title={t("toolbar.fetchTitle")}
              label={t("toolbar.fetchLabel")}
              disabled={remoteDisabled}
              isActive={busy === 'fetch'}
              onClick={() => void run('fetch')}
              icon={
                busy === 'fetch' && showSpinner ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  <CloudDownload className='h-3.5 w-3.5' />
                )
              }
              contextMenuContent={fetchMenu}
            />
            <ToolbarButton
              title={
                pullCount > 0 ? t("toolbar.pullTitlePending", { count: pullCount }) : t("toolbar.pullTitle")
              }
              label={t("toolbar.pullLabel")}
              badge={pullCount}
              disabled={remoteDisabled}
              isActive={busy === 'pull'}
              onClick={() => void run('pull')}
              icon={
                busy === 'pull' && showSpinner ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  <ArrowDownToLine className='h-3.5 w-3.5' />
                )
              }
            />
            <ToolbarButton
              title={t("toolbar.pushTitle", { title: pushTitle })}
              label={t("toolbar.pushLabel")}
              badge={pushCount}
              disabled={remoteDisabled}
              isActive={busy === 'push'}
              onClick={() => void runPush()}
              icon={
                busy === 'push' && showSpinner ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  <ArrowUpToLine className='h-3.5 w-3.5' />
                )
              }
              contextMenuContent={pushMenu}
            />
            <ToolbarButton
              title={t("toolbar.editRemoteTitle")}
              label={t("toolbar.editRemoteLabel")}
              onClick={() => setRemoteDialogOpen(true)}
              icon={<Link className='h-3.5 w-3.5' />}
            />
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup>
            <ToolbarButton
              title={t("toolbar.revealTitle")}
              label={t("toolbar.revealLabel")}
              onClick={() => void revealFolder()}
              icon={<FolderOpen className='h-3.5 w-3.5' />}
            />
            <ToolbarButton
              title={t("toolbar.terminalTitle")}
              label={t("toolbar.terminalLabel")}
              onClick={() => void openTerminalHere()}
              icon={<SquareTerminal className='h-3.5 w-3.5' />}
            />
            <ToolbarButton
              title={ideConfigured ? t("toolbar.ideOpenTitle") : t("toolbar.ideConfigureTitle")}
              label={t("toolbar.ideLabel")}
              disabled={!ideConfigured}
              onClick={() => void openIdeHere()}
              icon={<Code2 className='h-3.5 w-3.5' />}
            />
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup>
            <ToolbarButton
              title={bisectToolbarTitle}
              label={t("toolbar.bisectLabel")}
              isActive={bisectVisible}
              badge={bisect?.active && !bisect?.done ? (bisect.steps_remaining ?? undefined) : undefined}
              onClick={() => setBisectVisible(!bisectVisible)}
              icon={<ScanSearch className='h-3.5 w-3.5' />}
            />
          </ToolbarGroup>
        </div>
        <div className='flex w-full max-w-sm shrink-0 items-start gap-1 sm:w-auto sm:min-w-[12rem]'>
          {branches.length > 0 && (
            <BranchMultiSelect
              branches={branches}
              selectedBranches={branchFilter}
              onSelectionChange={names => setBranchFilter(path, names)}
            />
          )}
          <div className='flex min-w-0 flex-1 flex-col gap-1'>
            <Input
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              placeholder={t("toolbar.commitSearchPlaceholder")}
              spellCheck={false}
              autoComplete="off"
              aria-label={t("toolbar.commitSearchAria")}
              className='h-8'
            />
            {searchSlice?.loading &&
            searchSlice.query.trim() &&
            searchSlice.hits.length === 0 ? (
              <span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                <Loader2 className='h-3 w-3 shrink-0 animate-spin' />
                {t("toolbar.searchSearching")}
              </span>
            ) : null}
            {!searchSlice?.loading &&
            searchSlice?.query?.trim() &&
            searchSlice.hits.length === 0 ? (
              <span className='text-xs text-muted-foreground'>
                {t("toolbar.noMatches")}
              </span>
            ) : null}
          </div>
          {draftQuery.trim() ? (
            <div className='flex h-8 w-[1.375rem] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xs'>
              <Button
                type='button'
                variant='ghost'
                className='h-0 min-h-0 flex-1 rounded-none border-0 p-0 shadow-none hover:bg-muted/80'
                disabled={!canStepSearchMatches}
                title={t("toolbar.searchPrevTitle")}
                aria-label={t("toolbar.searchPrevAria")}
                onClick={() => requestCommitSearchMatchStep(path, 'prev')}
              >
                <ChevronUp className='size-2.5' strokeWidth={2.25} />
              </Button>
              <div className='h-px shrink-0 bg-border' aria-hidden />
              <Button
                type='button'
                variant='ghost'
                className='h-0 min-h-0 flex-1 rounded-none border-0 p-0 shadow-none hover:bg-muted/80'
                disabled={!canStepSearchMatches}
                title={t("toolbar.searchNextTitle")}
                aria-label={t("toolbar.searchNextAria")}
                onClick={() => requestCommitSearchMatchStep(path, 'next')}
              >
                <ChevronDown className='size-2.5' strokeWidth={2.25} />
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
    </>
  );
}
