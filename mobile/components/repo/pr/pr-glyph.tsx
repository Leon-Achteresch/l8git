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
  draft: 'bg-white/10',
  merged: 'bg-git-merge/15',
  closed: 'bg-git-removed/15',
};

const FOREGROUND: Record<PrDisplayState, string> = {
  open: 'text-git-added',
  draft: 'text-muted-foreground',
  merged: 'text-git-merge',
  closed: 'text-git-removed',
};

const SIZE = {
  sm: { box: 'h-8 w-8', icon: 15 },
  md: { box: 'h-11 w-11', icon: 19 },
  lg: { box: 'h-14 w-14', icon: 24 },
} as const;

export function PrGlyph({
  state,
  size = 'md',
  className,
}: {
  state: PrDisplayState;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <View
      className={cn(
        'items-center justify-center rounded-full',
        SURFACE[state],
        SIZE[size].box,
        className
      )}>
      <Icon as={PR_STATE_ICON[state]} size={SIZE[size].icon} className={FOREGROUND[state]} />
    </View>
  );
}
