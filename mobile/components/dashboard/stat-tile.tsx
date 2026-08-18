import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react-native';
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
  branch: 'text-git-branch',
};

export function StatTile({
  icon,
  label,
  value,
  tone = 'default',
  delta,
  loading = false,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: StatTone;
  delta?: number | null;
  loading?: boolean;
  className?: string;
}) {
  return (
    <View
      className={cn(
        'border-border bg-card/60 min-w-[46%] flex-1 gap-2 rounded-xl border px-3 py-2.5',
        className
      )}>
      <View className="flex-row items-center gap-1.5">
        <Icon as={icon} className="text-muted-foreground size-3.5" />
        <Text
          numberOfLines={1}
          className="text-muted-foreground text-2xs flex-1 font-medium uppercase tracking-widest">
          {label}
        </Text>
      </View>
      {loading ? (
        <Skeleton className="h-6 w-14 rounded" />
      ) : (
        <View className="flex-row items-baseline gap-2">
          <Text className={cn('font-mono text-xl leading-none', TONE_TEXT[tone])}>{value}</Text>
          <DeltaBadge value={delta} />
        </View>
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
    <View className="flex-row items-center gap-0.5">
      <Icon
        as={up ? ArrowUpRight : ArrowDownRight}
        className={cn('size-3', up ? 'text-git-added' : 'text-git-removed')}
      />
      <Text
        className={cn('font-mono text-2xs', up ? 'text-git-added' : 'text-git-removed')}>
        {`${Math.abs(value)}%`}
      </Text>
    </View>
  );
}
