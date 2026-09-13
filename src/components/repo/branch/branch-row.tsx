import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { toastError } from '@/lib/error-toast';
import type { Branch } from '@/lib/repo-store';
import { useRepoStore } from '@/lib/repo-store';
import { useBranchFocusStore } from '@/lib/use-branch-hotkeys';
import { useSidebarPrefs } from '@/lib/sidebar-prefs';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import {
  ArrowDown,
  Check,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Layers,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { m } from 'motion/react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useExplainSheet } from '@/components/ai/explain-sheet';
import { pickDefaultBaseBranch } from '@/lib/ai/explain-inputs';
import { RebaseDialog } from '../rebase/rebase-dialog';
import { MergeDialog } from './merge-dialog';
import { RemoteCheckoutDialog } from './remote-checkout-dialog';
import { RemoteDeleteConfirmDialog } from './remote-delete-confirm-dialog';

type CheckoutDraft = { remoteRef: string; defaultLocalName: string };

function splitRemote(name: string): { prefix: string; rest: string } {
  const i = name.indexOf('/');
  if (i < 0) return { prefix: '', rest: name };
  return { prefix: name.slice(0, i), rest: name.slice(i + 1) };
}

function BranchRowInner({
  path,
  branch,
  laneColor,
  onDelete,
}: {
  path: string;
  branch: Branch;
  laneColor: string;
  onDelete?: (b: Branch, force: boolean) => void;
}) {
  const { t } = useTranslation();
  const checkoutBranch = useRepoStore(s => s.checkoutBranch);
  const focusBranch = useBranchFocusStore(s => s.focusBranch);
  const blurBranch = useBranchFocusStore(s => s.blurBranch);
  const focusCommitFromBranchTip = useUiStore(s => s.focusCommitFromBranchTip);
  const requestPrCreate = useUiStore(s => s.requestPrCreate);
  const [checkoutDraft, setCheckoutDraft] = useState<CheckoutDraft | null>(
    null
  );
  const [deleteRemoteRef, setDeleteRemoteRef] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [rebaseOpen, setRebaseOpen] = useState(false);
  const explain = useExplainSheet();

  const openExplain = useCallback(() => {
    const branches = useRepoStore.getState().repos[path]?.branches ?? [];
    explain.open({
      kind: 'branch',
      repoPath: path,
      branch: branch.name,
      base: pickDefaultBaseBranch(branches, branch.name),
    });
  }, [explain, path, branch.name]);

  function defaultLocalFromRemote(remoteRef: string) {
    const slash = remoteRef.indexOf('/');
    return slash >= 0 ? remoteRef.slice(slash + 1) : remoteRef;
  }

  const performCheckout = useCallback(() => {
    if (!path || branch.is_current) return;
    void (async () => {
      try {
        if (branch.is_remote) {
          const local = defaultLocalFromRemote(branch.name).trim() || 'branch';
          await checkoutBranch(path, local, { fromRemote: branch.name });
        } else {
          await checkoutBranch(path, branch.name);
        }
      } catch (e) {
        toastError(String(e));
      }
    })();
  }, [path, branch, checkoutBranch]);

  const { prefix: remotePrefix, rest: remoteRest } = branch.is_remote
    ? splitRemote(branch.name)
    : { prefix: '', rest: branch.name };
  const hideGroupPrefix = useSidebarPrefs(s => s.hideBranchGroupPrefix);
  const refPath = branch.is_remote ? remoteRest : branch.name;
  const slash = refPath.indexOf('/');
  const displayName =
    hideGroupPrefix && slash > 0 ? refPath.slice(slash + 1) : refPath;

  const row = (
    <m.li
      tabIndex={0}
      onFocus={() => focusBranch(path, branch.name)}
      onBlur={() => blurBranch(path, branch.name)}
      onClick={e => {
        if (e.button !== 0) return;
        focusBranch(path, branch.name);
        focusCommitFromBranchTip(path, branch.tip);
      }}
      onDoubleClick={e => {
        e.preventDefault();
        performCheckout();
      }}
      title={branch.name}
      className={cn(
        'group/row relative flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-xl py-1.5 pl-2 pr-1.5 text-[0.8125rem] outline-none transition-[background-color,box-shadow,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-1 focus-visible:ring-ring',
        branch.is_current
          ? 'bg-background font-medium text-foreground shadow-[0_1px_2px_rgb(24_24_27/0.08),0_0_0_1px_rgb(24_24_27/0.05)] dark:bg-white/10 dark:shadow-none'
          : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground'
      )}
    >
      <span className='relative z-0 flex size-4 shrink-0 items-center justify-center'>
        {branch.is_current ? (
          <Check
            className='h-3.5 w-3.5 text-foreground'
            aria-label={t('branch.currentBranchAria')}
          />
        ) : (
          <span
            aria-hidden
            className='size-1.5 rounded-full opacity-80'
            style={{ backgroundColor: laneColor }}
          />
        )}
      </span>

      {branch.behind != null && branch.behind > 0 && (
        <span className='flex shrink-0 items-center gap-px rounded bg-git-removed/10 px-1 py-0.5 text-[0.625rem] font-semibold text-git-removed dark:bg-git-removed/10 dark:text-git-removed'>
          <ArrowDown className='size-3' aria-hidden />
          {branch.behind}
        </span>
      )}

      <span className='flex min-w-0 flex-1 items-baseline gap-1'>
        {branch.is_remote && remotePrefix && (
          <span className='shrink-0 text-[0.625rem] font-medium text-muted-foreground/55'>
            {remotePrefix}
          </span>
        )}
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-mono text-[0.75rem]',
            branch.is_current ? 'text-foreground' : 'text-foreground/90'
          )}
        >
          {displayName}
        </span>
      </span>
    </m.li>
  );

  const showRemoteCheckout = branch.is_remote && !branch.is_current;
  const showRemoteDelete = branch.is_remote && !branch.is_current;
  const showLocalSwitch = !branch.is_remote && !branch.is_current;
  const showDelete = !!onDelete && !branch.is_remote;

  function openRemoteCheckout() {
    const def = defaultLocalFromRemote(branch.name);
    const schedule = () =>
      setCheckoutDraft({
        remoteRef: branch.name,
        defaultLocalName: def,
      });
    window.requestAnimationFrame(schedule);
  }

  function openRemoteDeleteConfirm() {
    window.requestAnimationFrame(() => setDeleteRemoteRef(branch.name));
  }

  if (!path) {
    return row;
  }

  const hasLegacyItems =
    showLocalSwitch ||
    showRemoteCheckout ||
    showRemoteDelete ||
    !!(showDelete && onDelete);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onSelect={() => {
              window.requestAnimationFrame(openExplain);
            }}
          >
            <Sparkles className='h-3.5 w-3.5 text-primary' />
            {t('branch.menuExplainBranch')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              window.requestAnimationFrame(() =>
                requestPrCreate(path, branch.name),
              );
            }}
          >
            <GitPullRequest className='h-3.5 w-3.5' />
            {t('branch.createPullRequest')}
          </ContextMenuItem>
          {hasLegacyItems ? <ContextMenuSeparator /> : null}
          {showLocalSwitch ? (
            <>
              <ContextMenuItem
                onSelect={() => {
                  void (async () => {
                    try {
                      await checkoutBranch(path, branch.name);
                    } catch (e) {
                      toastError(String(e));
                    }
                  })();
                }}
              >
                <GitBranch className='h-3.5 w-3.5' />
                {t('branch.menuCheckout')}
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  window.requestAnimationFrame(() => setMergeOpen(true));
                }}
              >
                <GitMerge className='h-3.5 w-3.5' />
                {t('branch.menuMergeIntoCurrent')}
              </ContextMenuItem>
            </>
          ) : null}
          {!branch.is_current ? (
            <ContextMenuItem
              onSelect={() => {
                window.requestAnimationFrame(() => setRebaseOpen(true));
              }}
            >
              <Layers className='h-3.5 w-3.5' />
              {t('branch.menuRebaseOnto')}
            </ContextMenuItem>
          ) : null}
          {showRemoteCheckout ? (
            <ContextMenuItem onSelect={openRemoteCheckout}>
              <GitBranch className='h-3.5 w-3.5' />
              {t('branch.menuCheckoutRemoteLocal')}
            </ContextMenuItem>
          ) : null}
          {showRemoteDelete ? (
            <>
              {showRemoteCheckout ? <ContextMenuSeparator /> : null}
              <ContextMenuItem
                variant='destructive'
                onSelect={openRemoteDeleteConfirm}
              >
                <Trash2 className='h-3.5 w-3.5' />
                {t('branch.menuDeleteRemote')}
              </ContextMenuItem>
            </>
          ) : null}
          {showDelete && onDelete ? (
            <>
              {(showLocalSwitch || showRemoteCheckout || showRemoteDelete) && (
                <ContextMenuSeparator />
              )}
              <ContextMenuItem
                variant='destructive'
                disabled={branch.is_current}
                onSelect={() => onDelete(branch, false)}
              >
                <Trash2 className='h-3.5 w-3.5' />
                {t('branch.delete')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant='destructive'
                disabled={branch.is_current}
                onSelect={() => onDelete(branch, true)}
              >
                <Trash2 className='h-3.5 w-3.5' />
                {t('branch.menuForceDelete')}
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
      <RemoteCheckoutDialog
        open={!!checkoutDraft}
        onClose={() => setCheckoutDraft(null)}
        path={path}
        remoteRef={checkoutDraft?.remoteRef ?? ''}
        defaultLocalName={checkoutDraft?.defaultLocalName ?? ''}
      />
      <RemoteDeleteConfirmDialog
        open={!!deleteRemoteRef}
        onClose={() => setDeleteRemoteRef(null)}
        path={path}
        remoteRef={deleteRemoteRef ?? ''}
      />
      <MergeDialog
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        path={path}
        sourceBranch={branch.name}
      />
      <RebaseDialog
        open={rebaseOpen}
        onClose={() => setRebaseOpen(false)}
        path={path}
        upstream={branch.name}
      />
      {explain.element}
    </>
  );
}

export const BranchRow = memo(BranchRowInner, (a, b) => {
  if (a.path !== b.path) return false;
  if (a.laneColor !== b.laneColor) return false;
  if (a.onDelete !== b.onDelete) return false;
  const ab = a.branch;
  const bb = b.branch;
  return (
    ab === bb ||
    (ab.name === bb.name &&
      ab.is_current === bb.is_current &&
      ab.is_remote === bb.is_remote &&
      ab.tip === bb.tip &&
      ab.behind === bb.behind)
  );
});
