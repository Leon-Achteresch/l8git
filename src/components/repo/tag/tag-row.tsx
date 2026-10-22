import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { toastError } from '@/lib/error-toast';
import type { TagRef } from '@/lib/repo-store';
import { useRepoStore } from '@/lib/repo-store';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { Tag as TagIcon, Trash2 } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRowT } from '@/lib/i18n';
import { RemoteTagDeleteDialog } from './remote-tag-delete-dialog';
import { TagKindBadge } from './tag-kind-badge';

function TagRowInner({
  path,
  tag,
  laneColor,
}: {
  path: string;
  tag: TagRef;
  laneColor: string;
}) {
  const t = useRowT();
  // Actions are read on use: rows of long lists should not each subscribe to stores.
  const { focusCommitFromBranchTip } = useUiStore.getState();
  const { deleteTag } = useRepoStore.getState();
  const [remoteDeleteOpen, setRemoteDeleteOpen] = useState(false);

  async function performLocalDelete() {
    try {
      await deleteTag(path, tag.name);
    } catch (e) {
      toastError(String(e));
    }
  }

  const kind = tag.kind ?? 'lightweight';
  const message = tag.message?.trim() ?? '';
  const rowTitle = [
    tag.name,
    t(`tagKind.${kind}`),
    tag.tagger ? t('tagRow.taggerPrefix', { name: tag.tagger }) : '',
    message,
  ]
    .filter(Boolean)
    .join('\n');

  const row = (
    // Explicit role: in long lists the row sits inside a presentational chunk.
    <li
      role='listitem'
      onClick={e => {
        if (e.button !== 0) return;
        focusCommitFromBranchTip(path, tag.commit);
      }}
      title={rowTitle}
      className={cn(
        'group/row relative flex min-w-0 max-w-full cursor-pointer items-start gap-2 rounded-md py-1 pl-2 pr-1.5 text-[0.8125rem] text-muted-foreground transition-all hover:bg-sidebar-accent/40 hover:text-foreground hover:shadow-2xs'
      )}
    >
      <span
        aria-hidden
        className='absolute top-1/2 left-0.5 h-4 w-[2px] -translate-y-1/2 rounded-full opacity-60 transition-opacity group-hover/row:opacity-90'
        style={{ backgroundColor: laneColor }}
      />

      <span className='relative z-0 flex shrink-0 items-center justify-center pt-0.5'>
        <TagIcon
          className='h-3.5 w-3.5 text-muted-foreground/80'
          aria-hidden
        />
      </span>

      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='flex min-w-0 items-center gap-1.5'>
          <span className='min-w-0 flex-1 truncate font-mono text-[0.75rem] text-foreground/90'>
            {tag.name}
          </span>
          {kind !== 'lightweight' && <TagKindBadge kind={kind} compact />}
        </span>
        {message && (
          <span className='min-w-0 truncate text-[0.6875rem] leading-snug text-muted-foreground/80'>
            {message.split('\n')[0]}
          </span>
        )}
      </span>
    </li>
  );

  if (!path) return row;

  return (
    <>
      <ContextMenu deferMount>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          <TagRowMenuItems
            tagName={tag.name}
            onLocalDelete={() => void performLocalDelete()}
            onRemoteDelete={() => window.requestAnimationFrame(() => setRemoteDeleteOpen(true))}
          />
        </ContextMenuContent>
      </ContextMenu>
      {/* Closed, the dialog renders nothing; mounting it in every row of a long list is costly. */}
      {remoteDeleteOpen && (
        <RemoteTagDeleteDialog
          open
          onClose={() => setRemoteDeleteOpen(false)}
          path={path}
          tagName={tag.name}
        />
      )}
    </>
  );
}

/** Rendered only while the menu is open, so closed rows skip translating its labels. */
function TagRowMenuItems({
  tagName,
  onLocalDelete,
  onRemoteDelete,
}: {
  tagName: string;
  onLocalDelete: () => void;
  onRemoteDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ContextMenuItem
        variant='destructive'
        onSelect={() => {
          const ok = window.confirm(t('tagRow.confirmLocalDelete', { name: tagName }));
          if (ok) onLocalDelete();
        }}
      >
        <Trash2 className='h-3.5 w-3.5' />
        {t('tagRow.menuLocalDelete')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant='destructive' onSelect={onRemoteDelete}>
        <Trash2 className='h-3.5 w-3.5' />
        {t('tagRow.menuRemoteDelete')}
      </ContextMenuItem>
    </>
  );
}

export const TagRow = memo(TagRowInner, (a, b) => {
  if (a.path !== b.path) return false;
  if (a.laneColor !== b.laneColor) return false;
  return (
    a.tag.name === b.tag.name &&
    a.tag.commit === b.tag.commit &&
    a.tag.kind === b.tag.kind &&
    a.tag.message === b.tag.message
  );
});
