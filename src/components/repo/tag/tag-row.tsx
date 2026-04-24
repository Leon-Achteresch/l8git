import type { TagRef } from '@/lib/repo-store';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { Tag as TagIcon } from 'lucide-react';
import { memo } from 'react';

function TagRowInner({
  path,
  tag,
  laneColor,
}: {
  path: string;
  tag: TagRef;
  laneColor: string;
}) {
  const focusCommitFromBranchTip = useUiStore(s => s.focusCommitFromBranchTip);

  return (
    <li
      onClick={e => {
        if (e.button !== 0) return;
        focusCommitFromBranchTip(path, tag.commit);
      }}
      title={tag.name}
      className={cn(
        'group/row relative flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-md py-1 pl-2 pr-1.5 text-[13px] text-muted-foreground transition-all hover:bg-sidebar-accent/40 hover:text-foreground hover:shadow-2xs'
      )}
    >
      <span
        aria-hidden
        className='absolute top-1/2 left-0.5 h-4 w-[2px] -translate-y-1/2 rounded-full opacity-60 transition-opacity group-hover/row:opacity-90'
        style={{ backgroundColor: laneColor }}
      />

      <span className='relative z-0 flex shrink-0 items-center justify-center'>
        <TagIcon
          className='h-3.5 w-3.5 text-muted-foreground/80'
          aria-hidden
        />
      </span>

      <span className='flex min-w-0 flex-1 items-baseline gap-1'>
        <span className='min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/90'>
          {tag.name}
        </span>
      </span>
    </li>
  );
}

export const TagRow = memo(TagRowInner, (a, b) => {
  if (a.path !== b.path) return false;
  if (a.laneColor !== b.laneColor) return false;
  return a.tag.name === b.tag.name && a.tag.commit === b.tag.commit;
});
