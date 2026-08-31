import { CircleCheck } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Glass } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

export function InboxZero({ subtitle }: { subtitle?: string }) {
  return (
    <Animated.View
      entering={FadeIn.duration(320)}
      className="items-center justify-center gap-5 px-8 py-16">
      <Glass
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon as={CircleCheck} size={28} color={palette.success} />
      </Glass>
      <Animated.View entering={FadeInDown.duration(320).delay(120)} className="items-center gap-1.5">
        <Text className="text-foreground text-3xl font-bold tracking-tight">Inbox zero</Text>
        <Text className="text-muted-foreground max-w-72 text-center text-base leading-5">
          {subtitle ?? 'No reviews waiting, no red pipelines, nothing needs you right now.'}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
