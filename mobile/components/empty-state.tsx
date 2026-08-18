import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <View className={cn('flex-1 items-center justify-center gap-3 px-8 py-12', className)}>
      {icon ? (
        <View className="border-border bg-muted h-12 w-12 items-center justify-center rounded-full border">
          <Icon as={icon} className="text-muted-foreground size-5" />
        </View>
      ) : null}
      <View className="items-center gap-1">
        <Text className="text-foreground text-base font-medium">{title}</Text>
        {description ? (
          <Text className="text-muted-foreground text-center text-sm">{description}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}
