import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { groupBranchesByKind, groupSignature } from '@/lib/branch-groups';
import { laneColor } from '@/lib/graph';
import type { Branch } from '@/lib/repo-store';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { BranchRow } from './branch-row';

export function BranchSection({
  path,
  title,
  icon,
  branches,
  emptyLabel,
  onDelete,
  showNewBranch,
  onNewBranch,
}: {
  path: string;
  title: string;
  icon?: React.ReactNode;
  branches: Branch[];
  emptyLabel?: string;
  onDelete?: (b: Branch, force: boolean) => void;
  showNewBranch?: boolean;
  onNewBranch?: () => void;
}) {
  const grouping = useMemo(() => groupBranchesByKind(branches), [branches]);
  const sig = groupSignature(grouping);
  const defaultOpen = useMemo(() => grouping.groups.map(g => g.id), [grouping]);

  const isEmpty = grouping.flat.length === 0 && grouping.groups.length === 0;

  return (
    <section className='flex w-full min-w-0 max-w-full flex-col overflow-x-hidden'>
      <header
        className={cn(
          'mb-1 grid w-full min-w-0 items-center gap-2 px-2',
          icon != null
            ? 'grid-cols-[auto_minmax(0,1fr)_auto]'
            : 'grid-cols-[minmax(0,1fr)_auto]'
        )}
      >
        {icon != null ? (
          <span className='flex shrink-0 items-center justify-self-start'>
            {icon}
          </span>
        ) : null}
        <h3 className='min-w-0 justify-self-stretch truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground'>
          {title}
        </h3>
        <span className='flex shrink-0 items-center justify-end gap-0.5'>
          <span
            className='flex h-[18px] min-w-[20px] items-center justify-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground'
            aria-label={`${branches.length} Branches`}
          >
            {branches.length}
          </span>
          {showNewBranch && onNewBranch ? (
            <Button
              type='button'
              variant='ghost'
              size='icon-xs'
              className='h-5 w-5 text-muted-foreground hover:text-foreground'
              title='Neuer Branch'
              aria-label='Neuer Branch'
              onClick={() => onNewBranch()}
            >
              <Plus className='h-3 w-3' />
            </Button>
          ) : null}
        </span>
      </header>

      {isEmpty ? (
        <p className='px-2 pb-1 text-[11px] text-muted-foreground/70'>
          {emptyLabel ?? 'Keine Branches'}
        </p>
      ) : (
        <>
          {grouping.flat.length > 0 && (
            <ul className='mb-0.5 min-w-0 space-y-px'>
              {grouping.flat.map(b => (
                <BranchRow
                  key={b.name}
                  path={path}
                  branch={b}
                  laneColor={laneColor(b.name)}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          )}

          {grouping.groups.length > 0 && (
            <Accordion
              key={sig}
              type='multiple'
              defaultValue={defaultOpen}
              className='w-full min-w-0 max-w-full'
            >
              {grouping.groups.map(g => (
                <AccordionItem
                  key={g.id}
                  value={g.id}
                  className='min-w-0 border-0'
                >
                  <AccordionTrigger className='group/trigger my-px flex w-full min-w-0 max-w-full items-center justify-start gap-1 rounded-md py-1 pl-2 pr-1.5 text-left text-[11px] font-medium tracking-wide text-muted-foreground transition-colors hover:bg-sidebar-accent/30 hover:text-foreground hover:no-underline data-[state=open]:text-foreground [&>svg]:shrink-0 [&>svg]:text-muted-foreground/80'>
                    <span className='min-w-0 flex-1 truncate'>{g.label}</span>
                    <span
                      className={cn(
                        'flex h-4 min-w-4 shrink-0 items-center justify-center justify-self-end rounded-sm px-1 text-[9px] font-medium tabular-nums transition-colors',
                        'bg-muted/60 text-muted-foreground group-data-[state=open]/trigger:bg-muted group-data-[state=open]/trigger:text-foreground'
                      )}
                    >
                      {g.branches.length}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className='pb-0 pt-0 [&>div]:pb-1 [&>div]:pt-0.5'>
                    <ul className='min-w-0 space-y-px'>
                      {g.branches.map(b => (
                        <BranchRow
                          key={b.name}
                          path={path}
                          branch={b}
                          laneColor={laneColor(b.name)}
                          onDelete={onDelete}
                        />
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </>
      )}
    </section>
  );
}
