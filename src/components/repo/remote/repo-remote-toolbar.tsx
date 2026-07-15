import { BranchMultiSelect } from '@/components/repo/commit/branch-multi-select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PopIn } from '@/components/motion/pop-in';
import { useRepoToolsStore, type ToolAction } from '@/lib/repo-tools-store';
import { useTerminalStore } from '@/lib/terminal-store';
import { Input } from '@/components/ui/input';
import { toastError, toastGitError } from '@/lib/error-toast';
import { useRepoStore, type Branch } from '@/lib/repo-store';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import {
  useWorkspacePrefs,
  type PullStrategy,
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
  FileClock,
  FolderOpen,
  Link,
  Loader2,
  Play,
  ScanSearch,
  Search,
  SquareTerminal,
  Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CreateRemoteRepoDialog } from './create-remote-repo-dialog';
import { EditRemoteDialog } from './edit-remote-dialog';
import { PushUpstreamDialog } from './push-upstream-dialog';
import { ToolbarButton } from './toolbar-button';
import { ToolbarGroup } from './toolbar-group';

type RemoteOp = 'fetch' | 'pull' | 'push';

const SPINNER_DELAY_MS = 200;
const EMPTY_BRANCH_FILTER: ReadonlySet<string> = new Set();
const EMPTY_BRANCHES: readonly Branch[] = [];

export function RepoRemoteToolbar({ path }: { path: string }) {
  const { t } = useTranslation();
  const reload = useRepoStore(s => s.reload);
  const reloadStatus = useRepoStore(s => s.reloadStatus);
  const pullCount = useRepoStore(s => s.upstreamSync[path]?.behind ?? 0);
  const pushCount = useRepoStore(s => s.upstreamSync[path]?.ahead ?? 0);
  const lackUpstream = useRepoStore(s => s.hasUpstream[path] === false);
  const branch = useRepoStore(s => s.repos[path]?.branch ?? '');
  const branches = useRepoStore(s => s.repos[path]?.branches ?? EMPTY_BRANCHES);
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
  const openBlameEditor = useUiStore(s => s.openBlameEditor);
  const ideLaunchCommand = useWorkspacePrefs(s => s.ideLaunchCommand);
  const repoTerminalKind = useWorkspacePrefs(s => s.repoTerminalKind);
  const terminalButtonMode = useWorkspacePrefs(s => s.terminalButtonMode);
  const setTerminalButtonMode = useWorkspacePrefs(s => s.setTerminalButtonMode);
  const terminalVisible = useTerminalStore(s => !!s.visibleByPath[path]);
  const toggleTerminal = useTerminalStore(s => s.toggleVisible);
  const openTerminalTab = useTerminalStore(s => s.openTab);
  const tools = useRepoToolsStore(s => s.toolsByPath[path]);
  const loadTools = useRepoToolsStore(s => s.loadTools);
  const [pendingTool, setPendingTool] = useState<{
    label: string;
    run: string;
  } | null>(null);
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
  const pullStrategy = useWorkspacePrefs(s => s.pullStrategy);
  const setPullStrategy = useWorkspacePrefs(s => s.setPullStrategy);
  const [busy, setBusy] = useState<RemoteOp | null>(null);
  const [showSpinner, setShowSpinner] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
  const [createRemoteOpen, setCreateRemoteOpen] = useState(false);
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
              ? await invoke<string>('git_pull', { path, strategy: pullStrategy })
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
        toastGitError(String(e), {
          repoPath: path,
          onPull: () => void run('pull'),
          onStashAndPull: () => void (async () => {
            try {
              await invoke<string>('git_stash_push', { path, message: null, includeUntracked: false });
              await invoke<string>('git_pull', { path, strategy: pullStrategy });
              await Promise.all([reload(path), reloadStatus(path)]);
              toast.success(t("toolbar.actionSuccess"));
            } catch (e2) {
              toastError(String(e2));
            }
          })(),
        });
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
      pullStrategy,
      pushForceMode,
      pushTagsMode,
      pushAtomic,
      pushNoVerify,
      pushDryRun,
      t,
    ]
  );

  const runPush = useCallback(async () => {
    // No remote yet → offer to create one on a provider instead of failing.
    try {
      const remotes = await invoke<{ name: string; url: string }[]>(
        'list_git_remotes',
        { path }
      );
      if (remotes.length === 0) {
        setCreateRemoteOpen(true);
        return;
      }
    } catch {
      // If we can't determine remotes, fall back to the normal push flow.
    }
    if (lackUpstream) {
      setPushDialogOpen(true);
      return;
    }
    void run('push');
  }, [lackUpstream, run, path]);

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
        <DropdownMenuLabel>{t("toolbar.fetchPruneSection")}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={fetchPruneBranches}
          onCheckedChange={(v) => setFetchPruneBranches(!!v)}
          onSelect={(e) => e.preventDefault()}
        >
          {t("toolbar.fetchPruneBranches")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={fetchPruneTags}
          onCheckedChange={(v) => setFetchPruneTags(!!v)}
          onSelect={(e) => e.preventDefault()}
        >
          {t("toolbar.fetchPruneTags")}
        </DropdownMenuCheckboxItem>
      </>
    ),
    [fetchPruneBranches, fetchPruneTags, setFetchPruneBranches, setFetchPruneTags, t],
  );

  const pullMenu = useMemo(
    () => (
      <>
        <DropdownMenuLabel>{t("toolbar.pullStrategySection")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={pullStrategy}
          onValueChange={(v) => setPullStrategy(v as PullStrategy)}
        >
          <DropdownMenuRadioItem value="merge" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.pullStrategyMerge")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="rebase" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.pullStrategyRebase")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="ff-only" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.pullStrategyFfOnly")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="autostash" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.pullStrategyAutostash")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </>
    ),
    [pullStrategy, setPullStrategy, t],
  );

  const pushMenu = useMemo(
    () => (
      <>
        <DropdownMenuLabel>{t("toolbar.pushForceSection")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={pushForceMode} onValueChange={(v) => setPushForceMode(v as PushForceMode)}>
          <DropdownMenuRadioItem value="none" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.noForcePush")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="lease" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.forceLeaseOption")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="force" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.forceHardOption")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("toolbar.pushTagsSection")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={pushTagsMode} onValueChange={(v) => setPushTagsMode(v as PushTagsMode)}>
          <DropdownMenuRadioItem value="none" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.noTagsPush")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="follow" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.pushTagsReachable")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="all" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.pushTagsAllOption")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("toolbar.pushOptionsSection")}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={pushAtomic}
          onCheckedChange={(v) => setPushAtomic(!!v)}
          onSelect={(e) => e.preventDefault()}
        >
          {t("toolbar.atomicOption")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={pushNoVerify}
          onCheckedChange={(v) => setPushNoVerify(!!v)}
          onSelect={(e) => e.preventDefault()}
        >
          {t("toolbar.skipPrePushHooks")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={pushDryRun}
          onCheckedChange={(v) => setPushDryRun(!!v)}
          onSelect={(e) => e.preventDefault()}
        >
          {t("toolbar.dryRunOption")}
        </DropdownMenuCheckboxItem>
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

  const terminalMenu = useMemo(
    () => (
      <>
        <DropdownMenuLabel>{t("toolbar.terminalSection")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={terminalButtonMode}
          onValueChange={(v) =>
            setTerminalButtonMode(v === "external" ? "external" : "embedded")
          }
        >
          <DropdownMenuRadioItem value="embedded" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.terminalModeEmbedded")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="external" onSelect={(e) => e.preventDefault()}>
            {t("toolbar.terminalModeExternal")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => toggleTerminal(path)}>
          {t("toolbar.terminalToggleInApp")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void openTerminalHere()}>
          {t("toolbar.terminalOpenExternal")}
        </DropdownMenuItem>
      </>
    ),
    [path, terminalButtonMode, setTerminalButtonMode, toggleTerminal, t],
  );

  // Repo-declared tools (.l8git/tools.json)
  useEffect(() => {
    void loadTools(path);
  }, [path, loadTools]);

  const toolGroups = useMemo(
    () => (tools ?? []).filter((tool) => tool.available && tool.actions.length > 0),
    [tools],
  );

  const runTool = (action: ToolAction) => {
    // Runs in the embedded terminal so all console output + the exit code are shown.
    openTerminalTab(path, action.label, action.run);
  };

  const onSelectTool = (action: ToolAction) => {
    if (action.confirm) setPendingTool({ label: action.label, run: action.run });
    else runTool(action);
  };

  const trimmedQuery = draftQuery.trim();
  const hitCount = searchSlice?.hits?.length ?? 0;
  const searchLoading = !!searchSlice?.loading && !!searchSlice.query.trim();
  const canStepSearchMatches =
    !!trimmedQuery &&
    hitCount > 0 &&
    sidebarTab === 'history' &&
    activePath === path;

  return (
    <>
      <div className='flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-2 pt-1'>
        <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
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
              menuContent={fetchMenu}
              menuAriaLabel={t("toolbar.optionsAria")}
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
              menuContent={pullMenu}
              menuAriaLabel={t("toolbar.optionsAria")}
            />
            <ToolbarButton
              title={pushTitle}
              label={t("toolbar.pushLabel")}
              badge={pushCount}
              warnDot={pushForceMode !== 'none' || pushNoVerify || pushDryRun}
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
              menuContent={pushMenu}
              menuAriaLabel={t("toolbar.optionsAria")}
            />
          </ToolbarGroup>

          <div className='flex items-center gap-0.5'>
            <ToolbarButton
              title={t("toolbar.editRemoteTitle")}
              onClick={() => setRemoteDialogOpen(true)}
              icon={<Link className='h-3.5 w-3.5' />}
            />
            <ToolbarButton
              title={t("toolbar.revealTitle")}
              onClick={() => void revealFolder()}
              icon={<FolderOpen className='h-3.5 w-3.5' />}
            />
            <ToolbarButton
              title={t("toolbar.terminalTitle")}
              isActive={terminalButtonMode === 'embedded' && terminalVisible}
              onClick={() => {
                if (terminalButtonMode === 'embedded') {
                  toggleTerminal(path);
                } else {
                  void openTerminalHere();
                }
              }}
              icon={<SquareTerminal className='h-3.5 w-3.5' />}
              menuContent={terminalMenu}
              menuAriaLabel={t("toolbar.optionsAria")}
            />
            <ToolbarButton
              title={ideConfigured ? t("toolbar.ideOpenTitle") : t("toolbar.ideConfigureTitle")}
              disabled={!ideConfigured}
              onClick={() => void openIdeHere()}
              icon={<Code2 className='h-3.5 w-3.5' />}
            />
            <ToolbarButton
              title={t("toolbar.blameTitle")}
              onClick={() => openBlameEditor(path)}
              icon={<FileClock className='h-3.5 w-3.5' />}
            />
            <ToolbarButton
              title={bisectToolbarTitle}
              isActive={bisectVisible}
              badge={bisect?.active && !bisect?.done ? (bisect.steps_remaining ?? undefined) : undefined}
              onClick={() => setBisectVisible(!bisectVisible)}
              icon={<ScanSearch className='h-3.5 w-3.5' />}
            />
            {toolGroups.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    title={t("toolbar.toolsTitle")}
                    className='relative flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-primary/10 hover:text-primary'
                  >
                    <Wrench className='h-3.5 w-3.5' />
                    <ChevronDown className='size-3 opacity-60 transition-transform duration-200 in-data-[state=open]:rotate-180' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start' className='min-w-52'>
                  {toolGroups.map((group, gi) => [
                    gi > 0 ? <DropdownMenuSeparator key={`sep-${gi}`} /> : null,
                    <DropdownMenuLabel key={`lbl-${gi}`}>
                      {group.name}
                    </DropdownMenuLabel>,
                    ...group.actions.map((action, ai) => (
                      <DropdownMenuItem
                        key={`${gi}-${ai}`}
                        onSelect={() => onSelectTool(action)}
                      >
                        <Play className='h-3.5 w-3.5' />
                        <span className='flex-1 truncate'>{action.label}</span>
                      </DropdownMenuItem>
                    )),
                  ])}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className='flex w-full max-w-sm shrink-0 items-center gap-1 sm:w-auto'>
          {branches.length > 0 && (
            <BranchMultiSelect
              branches={branches}
              selectedBranches={branchFilter}
              onSelectionChange={names => setBranchFilter(path, names)}
            />
          )}
          <div
            className={cn(
              'group relative min-w-0 flex-1 transition-[width] duration-300 ease-out sm:flex-none',
              trimmedQuery ? 'sm:w-72' : 'sm:w-44 sm:focus-within:w-72',
            )}
          >
            <Search
              aria-hidden
              className='pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70 transition-colors duration-200 group-focus-within:text-foreground'
            />
            <Input
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canStepSearchMatches) {
                  e.preventDefault();
                  requestCommitSearchMatchStep(path, e.shiftKey ? 'prev' : 'next');
                } else if (e.key === 'Escape' && draftQuery) {
                  setDraftQuery('');
                }
              }}
              placeholder={t("toolbar.commitSearchPlaceholder")}
              spellCheck={false}
              autoComplete="off"
              aria-label={t("toolbar.commitSearchAria")}
              className={cn('h-8 pl-7', trimmedQuery ? 'pr-[5.75rem]' : 'pr-2')}
            />
            {trimmedQuery && (
              <div className='absolute inset-y-0 right-1 flex items-center gap-0.5'>
                <PopIn>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-xs'
                    className='h-6 w-5 rounded-md text-muted-foreground hover:text-destructive'
                    title={t("toolbar.searchClearAria")}
                    aria-label={t("toolbar.searchClearAria")}
                    onClick={() => setDraftQuery('')}
                  >
                    <X className='size-3' />
                  </Button>
                </PopIn>
                {searchLoading ? (
                  <Loader2 className='mx-1 h-3 w-3 shrink-0 animate-spin text-muted-foreground' />
                ) : (
                  <PopIn key={hitCount} title={t("toolbar.searchHitsTitle", { count: hitCount })}>
                    <span
                      className={cn(
                        'flex h-[18px] min-w-[18px] items-center justify-center rounded-md px-1 text-[10px] font-semibold tabular-nums',
                        hitCount === 0
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-muted/70 text-muted-foreground',
                      )}
                    >
                      {hitCount > 99 ? '99+' : hitCount}
                    </span>
                  </PopIn>
                )}
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-xs'
                  className='h-6 w-5 rounded-md text-muted-foreground hover:text-foreground'
                  disabled={!canStepSearchMatches}
                  title={t("toolbar.searchPrevTitle")}
                  aria-label={t("toolbar.searchPrevAria")}
                  onClick={() => requestCommitSearchMatchStep(path, 'prev')}
                >
                  <ChevronUp className='size-3' strokeWidth={2.25} />
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-xs'
                  className='h-6 w-5 rounded-md text-muted-foreground hover:text-foreground'
                  disabled={!canStepSearchMatches}
                  title={t("toolbar.searchNextTitle")}
                  aria-label={t("toolbar.searchNextAria")}
                  onClick={() => requestCommitSearchMatchStep(path, 'next')}
                >
                  <ChevronDown className='size-3' strokeWidth={2.25} />
                </Button>
              </div>
            )}
          </div>
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
      <CreateRemoteRepoDialog
        open={createRemoteOpen}
        onClose={() => setCreateRemoteOpen(false)}
        path={path}
      />
      <AlertDialog
        open={!!pendingTool}
        onOpenChange={(next) => {
          if (!next) setPendingTool(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("tools.confirmTitle", { label: pendingTool?.label ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription className='font-mono text-xs'>
              {t("tools.confirmDesc", { run: pendingTool?.run ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingTool) {
                  openTerminalTab(path, pendingTool.label, pendingTool.run);
                }
                setPendingTool(null);
              }}
            >
              {t("tools.run")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
