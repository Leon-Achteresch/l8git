import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

export type PillTone =
  | 'neutral'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'accent'
  | 'added'
  | 'removed'
  | 'modified'
  | 'branch'
  | 'merge';

const TONE_SURFACE: Record<PillTone, string> = {
  neutral: 'bg-muted border-border',
  success: 'bg-success/12 border-success/35',
  danger: 'bg-destructive/12 border-destructive/35',
  warning: 'bg-warning/12 border-warning/35',
  info: 'bg-git-branch/12 border-git-branch/35',
  accent: 'bg-accent border-border',
  added: 'bg-git-added/12 border-git-added/35',
  removed: 'bg-git-removed/12 border-git-removed/35',
  modified: 'bg-git-modified/12 border-git-modified/35',
  branch: 'bg-git-branch/12 border-git-branch/35',
  merge: 'bg-git-merge/12 border-git-merge/35',
};

const TONE_TEXT: Record<PillTone, string> = {
  neutral: 'text-muted-foreground',
  success: 'text-success',
  danger: 'text-destructive',
  warning: 'text-warning',
  info: 'text-git-branch',
  accent: 'text-foreground',
  added: 'text-git-added',
  removed: 'text-git-removed',
  modified: 'text-git-modified',
  branch: 'text-git-branch',
  merge: 'text-git-merge',
};

const TONE_DOT: Record<PillTone, string> = {
  neutral: 'bg-muted-foreground',
  success: 'bg-success',
  danger: 'bg-destructive',
  warning: 'bg-warning',
  info: 'bg-git-branch',
  accent: 'bg-foreground',
  added: 'bg-git-added',
  removed: 'bg-git-removed',
  modified: 'bg-git-modified',
  branch: 'bg-git-branch',
  merge: 'bg-git-merge',
};

export type StatusPillProps = {
  label: string | number;
  tone?: PillTone;
  icon?: LucideIcon;
  dot?: boolean;
  mono?: boolean;
  size?: 'xs' | 'sm';
  className?: string;
};

export function StatusPill({
  label,
  tone = 'neutral',
  icon,
  dot = false,
  mono = false,
  size = 'sm',
  className,
}: StatusPillProps) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1 rounded-full border',
        TONE_SURFACE[tone],
        size === 'xs' ? 'px-1.5 py-px' : 'px-2 py-0.5',
        className
      )}>
      {dot ? <View className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} /> : null}
      {icon ? <Icon as={icon} size={size === 'xs' ? 9 : 11} className={TONE_TEXT[tone]} /> : null}
      <Text
        numberOfLines={1}
        className={cn(
          TONE_TEXT[tone],
          mono ? 'font-mono' : 'font-medium',
          size === 'xs' ? 'text-2xs' : 'text-xs'
        )}>
        {label}
      </Text>
    </View>
  );
}
