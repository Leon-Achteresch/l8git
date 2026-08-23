import * as React from 'react';
import { Image, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Text } from '~/components/ui/text';
import { illustrationsLarge } from '~/lib/illustrations';

export function InboxZero({ subtitle }: { subtitle?: string }) {
  return (
    <Animated.View
      entering={FadeIn.duration(320)}
      className="items-center justify-center gap-5 px-8 py-16">
      <View
        style={{
          width: 120,
          height: 120,
          borderRadius: 60,
          overflow: 'hidden',
          backgroundColor: 'rgba(255,255,255,0.08)',
        }}>
        <Image
          source={illustrationsLarge.inbox}
          resizeMode="cover"
          style={{ width: 120, height: 120 }}
        />
      </View>

      <Animated.View entering={FadeInDown.duration(320).delay(120)} className="items-center gap-1.5">
        <Text className="text-foreground text-3xl font-bold tracking-tight">Inbox zero</Text>
        <Text className="text-muted-foreground max-w-72 text-center text-base">
          {subtitle ?? 'No reviews waiting, no red pipelines, nothing needs you right now.'}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
