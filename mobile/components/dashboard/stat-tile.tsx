import { ArrowDownRight, ArrowUpRight } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

export type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'branch';

const TONE_TEXT: Record<StatTone, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  branch: 'text-foreground',
};

const NUM = { fontVariant: ['tabular-nums' as const] };

export function StatTile({
  label,
  value,
  tone = 'default',
  delta,
  loading = false,
  className,
}: {
  label: string;
  value: string;
  tone?: StatTone;
  delta?: number | null;
  loading?: boolean;
  className?: string;
}) {
  return (
    <View className={cn('bg-card min-w-[46%] flex-1 gap-3 rounded-3xl px-4 py-4', className)}>
      <View className="flex-row items-center justify-between">
        <Text
          numberOfLines={1}
          className="text-muted-foreground text-2xs font-medium uppercase tracking-wider">
          {label}
        </Text>
        <DeltaBadge value={delta} />
      </View>
      {loading ? (
        <Skeleton className="h-8 w-16 rounded-lg" />
      ) : (
        <Text
          style={NUM}
          numberOfLines={1}
          className={cn('text-[26px] font-bold leading-tight', TONE_TEXT[tone])}>
          {value}
        </Text>
      )}
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
