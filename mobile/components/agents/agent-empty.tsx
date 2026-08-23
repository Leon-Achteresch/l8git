import type { ImageSourcePropType } from 'react-native';
import * as React from 'react';
import { Image, View } from 'react-native';

import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

export function AgentEmpty({
  source,
  title,
  description,
  action,
  className,
}: {
  source: ImageSourcePropType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('flex-1 items-center justify-center gap-5 px-8 py-14', className)}>
      <View
        style={{
          width: 124,
          height: 124,
          borderRadius: 62,
          padding: 4,
          backgroundColor: 'rgba(255,255,255,0.06)',
        }}>
        <Image source={source} resizeMode="cover" style={{ width: 116, height: 116, borderRadius: 58 }} />
      </View>
      <View className="items-center gap-1.5">
        <Text className="text-foreground text-xl font-bold tracking-tight">{title}</Text>
        {description ? (
          <Text className="text-muted-foreground text-center text-sm leading-5">{description}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}
