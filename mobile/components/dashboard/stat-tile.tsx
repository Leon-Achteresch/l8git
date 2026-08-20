import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { IconBadge } from '~/components/shared/icon-badge';
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

export type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'branch';

const TONE_TEXT: Record<StatTone, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  branch: 'text-git-branch',
};

const TONE_COLOR: Record<StatTone, string> = {
  default: palette.cat.blue,
  success: palette.cat.green,
  warning: palette.cat.orange,
  danger: palette.cat.coral,
  branch: palette.cat.blue,
};

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.25,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 6,
} as const;

const NUM = { fontVariant: ['tabular-nums' as const] };

export function StatTile({
  icon,
  label,
  value,
  tone = 'default',
  color,
  delta,
  loading = false,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: StatTone;
  color?: string;
  delta?: number | null;
  loading?: boolean;
  className?: string;
}) {
  return (
    <View
      style={CARD_SHADOW}
      className={cn(
        'border-border bg-card min-w-[46%] flex-1 gap-3 rounded-2xl border px-4 py-4',
        className
      )}>
      <View className="flex-row items-center justify-between">
        <IconBadge icon={icon} color={color ?? TONE_COLOR[tone]} size="md" />
        <DeltaBadge value={delta} />
      </View>
      <View className="gap-1">
        <Text
          numberOfLines={1}
          className="text-muted-foreground text-2xs font-semibold uppercase tracking-widest">
          {label}
        </Text>
        {loading ? (
          <Skeleton className="h-9 w-16 rounded-lg" />
        ) : (
          <Text
            style={NUM}
            numberOfLines={1}
            className={cn('text-4xl font-bold leading-none', TONE_TEXT[tone])}>
            {value}
          </Text>
        )}
      </View>
    </View>
  );
}

export function DeltaBadge({ value }: { value?: number | null }) {
  if (value === null || value === undefined || value === 0) {
    return null;
  }
  const up = value > 0;
  return (
    <View
      className={cn(
        'flex-row items-center gap-0.5 rounded-full px-2 py-1',
        up ? 'bg-git-added/15' : 'bg-git-removed/15'
      )}>
      <Icon
        as={up ? ArrowUpRight : ArrowDownRight}
        className={cn('size-3', up ? 'text-git-added' : 'text-git-removed')}
      />
      <Text
        style={NUM}
        className={cn('text-2xs font-semibold', up ? 'text-git-added' : 'text-git-removed')}>
        {`${Math.abs(value)}%`}
      </Text>
    </View>
  );
}
