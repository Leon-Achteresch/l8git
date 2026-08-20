import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { IconBadge } from '~/components/shared/icon-badge';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

type EmptyStateProps = {
  icon?: LucideIcon;
  iconColor?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon,
  iconColor = palette.cat.coral,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <View className={cn('flex-1 items-center justify-center gap-4 px-8 py-12', className)}>
      {icon ? <IconBadge icon={icon} color={iconColor} size="lg" /> : null}
      <View className="items-center gap-1.5">
        <Text className="text-foreground text-lg font-bold">{title}</Text>
        {description ? (
          <Text className="text-muted-foreground text-center text-sm">{description}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}
