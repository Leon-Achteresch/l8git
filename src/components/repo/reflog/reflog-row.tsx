import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate, formatRelative } from '@/lib/format';
import { reflogActionTone, type ReflogEntry } from '@/lib/reflog-format';
import { cn } from '@/lib/utils';
import { Copy, Eye, GitBranch, MoreHorizontal, RotateCcw } from 'lucide-react';
import { m } from 'motion/react';
import { useTranslation } from 'react-i18next';

const TONE_VARIANT = {
  merge: 'info',
  rebase: 'warning',
  reset: 'destructive',
  commit: 'success',
  pick: 'warning',
  checkout: 'secondary',
  other: 'outline',
} as const;

export function ReflogRow({
  entry,
  onCopyHash,
  onResetKeep,
  onResetHard,
  onInspect,
  onCreateBranch,
}: {
  entry: ReflogEntry;
  onCopyHash: (hash: string) => void;
  onResetKeep: (entry: ReflogEntry) => void;
  onResetHard: (entry: ReflogEntry) => void;
  onInspect: (entry: ReflogEntry) => void;
  onCreateBranch: (entry: ReflogEntry) => void;
}) {
  const { t } = useTranslation();
  const variant = TONE_VARIANT[reflogActionTone(entry.action)];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <m.div className='flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-2.5 py-2 transition-colors hover:border-border hover:bg-card/70'>
          <span className='hidden w-20 shrink-0 font-mono text-[0.6875rem] text-muted-foreground sm:inline'>
            {entry.selector}
          </span>
          <Badge variant={variant} className='max-w-24 shrink-0 overflow-hidden text-ellipsis font-mono text-[0.625rem] sm:max-w-40'>
            {entry.action}
          </Badge>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-6 shrink-0 gap-1 px-1.5 font-mono text-[0.6875rem] text-muted-foreground hover:text-foreground'
            title={t('reflog.copyHash')}
            onClick={() => onCopyHash(entry.hash)}
          >
            {entry.short_hash}
            <Copy className='size-3' />
          </Button>
          <button
            type='button'
            className={cn('min-w-0 flex-1 truncate rounded-sm text-left text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
            title={t('recovery.inspectCommit') + ': ' + entry.subject}
            onClick={() => onInspect(entry)}
          >
            {entry.message || entry.subject}
          </button>
          <Button type='button' variant='ghost' size='icon-xs' className='shrink-0 text-primary' title={t('recovery.createBranch')} aria-label={t('recovery.createBranch')} onClick={() => onCreateBranch(entry)}><GitBranch className='size-3.5' /></Button>
          <span
            className='hidden shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground md:inline'
            title={formatDate(entry.date)}
          >
            {formatRelative(entry.date)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='icon-xs'
                className='shrink-0 text-muted-foreground'
                aria-label={t('reflog.rowMenuAria')}
                title={t('reflog.rowMenuAria')}
              >
                <MoreHorizontal className='size-3.5' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='min-w-64'>
              <DropdownMenuItem onSelect={() => onInspect(entry)}><Eye className='size-3.5' />{t('recovery.inspectCommit')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCreateBranch(entry)}><GitBranch className='size-3.5' />{t('recovery.createBranch')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onResetKeep(entry)}>
                <RotateCcw className='size-3.5' />
                {t('reflog.resetKeep')}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                onSelect={() => onResetHard(entry)}
              >
                <RotateCcw className='size-3.5' />
                {t('reflog.resetHard')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onCopyHash(entry.hash)}>
                <Copy className='size-3.5' />
                {t('reflog.copyHash')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </m.div>
      </ContextMenuTrigger>
      <ContextMenuContent className='min-w-64'>
        <ContextMenuItem onSelect={() => onInspect(entry)}><Eye className='size-3.5' />{t('recovery.inspectCommit')}</ContextMenuItem>
        <ContextMenuItem onSelect={() => onCreateBranch(entry)}><GitBranch className='size-3.5' />{t('recovery.createBranch')}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onResetKeep(entry)}>
          <RotateCcw className='size-3.5' />
          {t('reflog.resetKeep')}
        </ContextMenuItem>
        <ContextMenuItem
          variant='destructive'
          onSelect={() => onResetHard(entry)}
        >
          <RotateCcw className='size-3.5' />
          {t('reflog.resetHard')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onCopyHash(entry.hash)}>
          <Copy className='size-3.5' />
          {t('reflog.copyHash')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
