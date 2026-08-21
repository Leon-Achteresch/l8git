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
      <Image source={source} resizeMode="cover" style={{ width: 112, height: 112, borderRadius: 30 }} />
      <View className="items-center gap-1.5">
        <Text className="text-foreground text-xl font-bold">{title}</Text>
        {description ? (
          <Text className="text-muted-foreground text-center text-sm leading-5">{description}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}
