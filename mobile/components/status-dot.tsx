import { View } from 'react-native';

import { cn } from '~/lib/utils';

export type StatusTone =
  | 'online'
  | 'offline'
  | 'connecting'
  | 'error'
  | 'added'
  | 'removed'
  | 'modified'
  | 'branch'
  | 'neutral';

const TONE_CLASS: Record<StatusTone, string> = {
  online: 'bg-success',
  offline: 'bg-muted-foreground/50',
  connecting: 'bg-warning',
  error: 'bg-destructive',
  added: 'bg-git-added',
  removed: 'bg-git-removed',
  modified: 'bg-git-modified',
  branch: 'bg-git-branch',
  neutral: 'bg-muted-foreground',
};

const SIZE_CLASS = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
  lg: 'h-2.5 w-2.5',
} as const;

export function StatusDot({
  tone = 'neutral',
  size = 'md',
  pulse = false,
  className,
}: {
  tone?: StatusTone;
  size?: keyof typeof SIZE_CLASS;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <View
      className={cn(
        'rounded-full',
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        pulse && 'animate-pulse',
        className
      )}
    />
  );
}
