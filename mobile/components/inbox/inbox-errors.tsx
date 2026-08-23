import { RefreshCw, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { GlassPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import type { InboxRepoError } from '~/lib/inbox';

export function InboxErrors({
  errors,
  busy,
  onRetry,
}: {
  errors: InboxRepoError[];
  busy: boolean;
  onRetry: () => void;
}) {
  if (errors.length === 0) {
    return null;
  }

  const visible = errors.slice(0, 3);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      className="bg-card gap-2.5 rounded-[28px] px-4 py-3.5">
      <View className="flex-row items-center gap-3">
        <View className="bg-warning/15 h-10 w-10 items-center justify-center rounded-full">
          <Icon as={TriangleAlert} size={19} className="text-warning" />
        </View>
        <Text className="text-foreground min-w-0 flex-1 text-sm font-semibold">
          {errors.length === 1 ? '1 repo could not be read' : `${errors.length} repos could not be read`}
        </Text>
        <GlassPill
          icon={RefreshCw}
          label="Retry"
          onPress={busy ? undefined : onRetry}
          style={{ opacity: busy ? 0.5 : 1 }}
        />
      </View>

      <View style={{ paddingLeft: 52 }} className="gap-0.5">
        {visible.map((error) => (
          <Text
            key={`${error.hostId}:${error.path}`}
            numberOfLines={1}
            className="text-muted-foreground text-2xs">
            {error.repoName} — {error.message}
          </Text>
        ))}
        {errors.length > visible.length ? (
          <Text className="text-muted-foreground/70 text-2xs">
            +{errors.length - visible.length} more
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}
