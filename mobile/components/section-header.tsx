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
    <View className={cn('flex-row items-center justify-between pb-2 pt-4', className)}>
      <View className="flex-row items-center gap-2">
        <Text
          style={{ letterSpacing: 0.4 }}
          className="text-muted-foreground text-2xs font-medium uppercase">
          {title}
        </Text>
        {typeof count === 'number' ? (
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-muted-foreground font-mono text-2xs">
            {count}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}
