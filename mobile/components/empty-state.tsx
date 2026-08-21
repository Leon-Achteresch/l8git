import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Image, View } from 'react-native';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { illustrationsLarge, type IllustrationName } from '~/lib/illustrations';
import { cn } from '~/lib/utils';

type EmptyStateProps = {
  icon?: LucideIcon;
  iconColor?: string;
  illustration?: IllustrationName;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon,
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <View className={cn('flex-1 items-center justify-center gap-4 px-8 py-12', className)}>
      {illustration ? (
        <Image
          source={illustrationsLarge[illustration]}
          resizeMode="contain"
          style={{ width: 110, height: 110 }}
        />
      ) : icon ? (
        <Icon as={icon} size={44} className="text-muted-foreground" />
      ) : null}
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
