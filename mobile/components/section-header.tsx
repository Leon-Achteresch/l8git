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
        <Text className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
          {title}
        </Text>
        {typeof count === 'number' ? (
          <Text className="text-muted-foreground font-mono text-xs">{count}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}
