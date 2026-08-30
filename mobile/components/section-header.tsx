import { ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

export function SectionHeader({
  title,
  count,
  action,
  actionLabel,
  onAction,
  muted,
  className,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  muted?: boolean;
  className?: string;
}) {
  return (
    <View className={cn('flex-row items-center justify-between pb-3 pt-5', className)}>
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <Text
          className={
            muted ? 'text-muted-foreground text-sm' : 'text-foreground text-base font-semibold'
          }>
          {title}
        </Text>
        {typeof count === 'number' ? (
          <Text style={{ fontVariant: ['tabular-nums'] }} className="text-muted-foreground text-sm">
            {count}
          </Text>
        ) : null}
      </View>
      {onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel ?? title}
          hitSlop={8}
          onPress={onAction}
          className="flex-row items-center gap-0.5">
          <Text className="text-muted-foreground text-sm">{actionLabel ?? 'See all'}</Text>
          <Icon as={ChevronRight} size={16} color={palette.mutedForeground} />
        </Pressable>
      ) : (
        action
      )}
    </View>
  );
}
