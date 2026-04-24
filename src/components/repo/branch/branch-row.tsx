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
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Check,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Trash2,
} from 'lucide-react';
import { memo, useCallback, useState } from 'react';
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
  const checkoutBranch = useRepoStore(s => s.checkoutBranch);
  const focusCommitFromBranchTip = useUiStore(s => s.focusCommitFromBranchTip);
  const [checkoutDraft, setCheckoutDraft] = useState<CheckoutDraft | null>(
    null
  );
  const [deleteRemoteRef, setDeleteRemoteRef] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

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
  const displayName = branch.is_remote ? remoteRest : branch.name;

  const row = (
    <li
      onClick={e => {
        if (e.button !== 0) return;
        focusCommitFromBranchTip(path, branch.tip);
      }}
      onDoubleClick={e => {
        e.preventDefault();
        performCheckout();
      }}
      title={branch.name}
      className={cn(
        'group/row relative flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-md py-1 pl-2 pr-1.5 text-[13px] transition-all',
        branch.is_current
          ? 'bg-sidebar-accent/70 font-medium text-sidebar-accent-foreground shadow-2xs'
          : 'text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground hover:shadow-2xs'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-1/2 left-0.5 h-4 w-[2px] -translate-y-1/2 rounded-full transition-opacity',
          branch.is_current
            ? 'opacity-100'
            : 'opacity-60 group-hover/row:opacity-90'
        )}
        style={{ backgroundColor: laneColor }}
      />

      <span className='relative z-0 flex shrink-0 items-center justify-center'>
        {branch.is_current ? (
          <Check
            className='h-3.5 w-3.5 text-primary'
            aria-label='Aktueller Branch'
          />
        ) : null}
      </span>

      <span className='flex min-w-0 flex-1 items-baseline gap-1'>
        {branch.is_remote && remotePrefix && (
          <span className='shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70'>
            {remotePrefix}
          </span>
        )}
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-mono text-[12px]',
            branch.is_current ? 'text-foreground' : 'text-foreground/90'
          )}
        >
          {displayName}
        </span>
      </span>
    </li>
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
              void (async () => {
                try {
                  const url = await invoke<string>('pr_create_web_url', {
                    path,
                    branch: branch.name,
                  });
                  await openUrl(url);
                } catch (e) {
                  toastError(String(e));
                }
              })();
            }}
          >
            <GitPullRequest className='h-3.5 w-3.5' />
            Pull Request erstellen …
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
                Auschecken
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  window.requestAnimationFrame(() => setMergeOpen(true));
                }}
              >
                <GitMerge className='h-3.5 w-3.5' />
                In aktuellen Branch mergen …
              </ContextMenuItem>
            </>
          ) : null}
          {showRemoteCheckout ? (
            <ContextMenuItem onSelect={openRemoteCheckout}>
              <GitBranch className='h-3.5 w-3.5' />
              Als lokalen Branch auschecken
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
                Remote-Branch löschen
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
                Löschen
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant='destructive'
                disabled={branch.is_current}
                onSelect={() => onDelete(branch, true)}
              >
                <Trash2 className='h-3.5 w-3.5' />
                Erzwingen (−D)
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
      ab.tip === bb.tip)
  );
});
