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
import { Copy, MoreHorizontal, RotateCcw } from 'lucide-react';
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
}: {
  entry: ReflogEntry;
  onCopyHash: (hash: string) => void;
  onResetKeep: (entry: ReflogEntry) => void;
  onResetHard: (entry: ReflogEntry) => void;
}) {
  const { t } = useTranslation();
  const variant = TONE_VARIANT[reflogActionTone(entry.action)];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className='flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-2.5 py-2 transition-colors hover:border-border hover:bg-card/70'>
          <span className='w-20 shrink-0 font-mono text-[11px] text-muted-foreground'>
            {entry.selector}
          </span>
          <Badge variant={variant} className='shrink-0 font-mono text-[10px]'>
            {entry.action}
          </Badge>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-6 shrink-0 gap-1 px-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground'
            title={t('reflog.copyHash')}
            onClick={() => onCopyHash(entry.hash)}
          >
            {entry.short_hash}
            <Copy className='size-3' />
          </Button>
          <span
            className={cn('min-w-0 flex-1 truncate text-xs')}
            title={entry.subject}
          >
            {entry.message || entry.subject}
          </span>
          <span
            className='shrink-0 text-[11px] tabular-nums text-muted-foreground'
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
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className='min-w-64'>
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
