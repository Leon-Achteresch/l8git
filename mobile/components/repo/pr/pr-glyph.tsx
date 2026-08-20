import { CircleDashed, CircleX, GitMerge, GitPullRequest } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import type { PrDisplayState } from '~/components/repo/pr/pr-types';
import type { PillTone } from '~/components/shared/status-pill';
import { Icon } from '~/components/ui/icon';
import { cn } from '~/lib/utils';

export const PR_STATE_ICON: Record<PrDisplayState, LucideIcon> = {
  open: GitPullRequest,
  draft: CircleDashed,
  merged: GitMerge,
  closed: CircleX,
};

export const PR_STATE_TONE: Record<PrDisplayState, PillTone> = {
  open: 'added',
  draft: 'neutral',
  merged: 'merge',
  closed: 'removed',
};

export const PR_STATE_LABEL: Record<PrDisplayState, string> = {
  open: 'Open',
  draft: 'Draft',
  merged: 'Merged',
  closed: 'Closed',
};

const SURFACE: Record<PrDisplayState, string> = {
  open: 'bg-git-added/15',
  draft: 'bg-secondary',
  merged: 'bg-git-merge/15',
  closed: 'bg-git-removed/15',
};

const FOREGROUND: Record<PrDisplayState, string> = {
  open: 'text-git-added',
  draft: 'text-muted-foreground',
  merged: 'text-git-merge',
  closed: 'text-git-removed',
};

export function PrGlyph({
  state,
  size = 'md',
  className,
}: {
  state: PrDisplayState;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <View
      className={cn(
        'items-center justify-center',
        SURFACE[state],
        size === 'sm' ? 'h-8 w-8 rounded-xl' : 'h-10 w-10 rounded-2xl',
        className
      )}>
      <Icon
        as={PR_STATE_ICON[state]}
        size={size === 'sm' ? 15 : 19}
        className={FOREGROUND[state]}
      />
    </View>
  );
}
