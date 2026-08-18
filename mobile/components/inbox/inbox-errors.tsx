import { RefreshCw, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button } from '~/components/ui/button';
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
      className="border-git-modified/35 bg-git-modified/8 gap-2 rounded-2xl border px-3.5 py-3">
      <View className="flex-row items-center gap-2">
        <Icon as={TriangleAlert} size={14} className="text-git-modified" />
        <Text className="text-git-modified min-w-0 flex-1 text-xs font-medium">
          {errors.length === 1 ? '1 repo could not be read' : `${errors.length} repos could not be read`}
        </Text>
        <Button size="sm" variant="ghost" disabled={busy} onPress={onRetry}>
          <Icon as={RefreshCw} size={13} className="text-muted-foreground" />
          <Text className="text-xs">Retry</Text>
        </Button>
      </View>

      <View className="gap-0.5">
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
