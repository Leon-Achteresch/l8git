import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Image, View } from 'react-native';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { illustrationsLarge, type IllustrationName } from '~/lib/illustrations';
import { palette } from '~/lib/theme';
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

const BUBBLE = 120;

export function EmptyState({
  icon,
  iconColor = palette.foreground,
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <View className={cn('flex-1 items-center justify-center gap-5 px-8 py-12', className)}>
      {illustration || icon ? (
        <View
          style={{
            width: BUBBLE,
            height: BUBBLE,
            borderRadius: BUBBLE / 2,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.08)',
          }}>
          {illustration ? (
            <Image
              source={illustrationsLarge[illustration]}
              resizeMode="cover"
              style={{ width: BUBBLE, height: BUBBLE }}
            />
          ) : icon ? (
            <Icon as={icon} size={44} color={iconColor} />
          ) : null}
        </View>
      ) : null}
      <View className="items-center gap-1.5">
        <Text className="text-foreground text-center text-xl font-bold tracking-tight">{title}</Text>
        {description ? (
          <Text className="text-muted-foreground max-w-72 text-center text-sm">{description}</Text>
        ) : null}
      </View>
      {action ? <View className="items-center pt-1">{action}</View> : null}
    </View>
  );
}
