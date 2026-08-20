import * as React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

type SectionHeaderProps = {
  title: string;
  count?: number;
  action?: React.ReactNode;
  className?: string;
};

export function SectionHeader({ title, count, action, className }: SectionHeaderProps) {
  return (
    <View className={cn('flex-row items-center justify-between pb-3 pt-5', className)}>
      <View className="flex-row items-center gap-2.5">
        <Text className="text-foreground text-xl font-bold">{title}</Text>
        {typeof count === 'number' ? (
          <View className="bg-secondary min-w-6 items-center rounded-full px-2.5 py-0.5">
            <Text
              style={{ fontVariant: ['tabular-nums'] }}
              className="text-muted-foreground text-xs font-semibold">
              {count}
            </Text>
          </View>
        ) : null}
      </View>
      {action}
    </View>
  );
}
