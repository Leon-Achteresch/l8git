import { CloudOff, RotateCw, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { EmptyState } from '~/components/empty-state';
import { errorMessage } from '~/components/repo/git-types';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { useHostMeta } from '~/lib/connections';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

export function QueryErrorState({
  title,
  error,
  onRetry,
  className,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      className={cn(
        'border-destructive/30 bg-destructive/5 mt-2 gap-3 rounded-2xl border p-4',
        className
      )}>
      <View className="flex-row items-center gap-2">
        <Icon as={TriangleAlert} size={15} className="text-destructive" />
        <Text className="text-destructive flex-1 text-sm font-medium">{title}</Text>
      </View>
      <Text className="text-muted-foreground font-mono text-2xs">{errorMessage(error)}</Text>
      {onRetry ? (
        <Button variant="outline" size="sm" onPress={onRetry} className="self-start">
          <Icon as={RotateCw} size={13} className="text-foreground" />
          <Text className="text-xs">Retry</Text>
        </Button>
      ) : null}
    </Animated.View>
  );
}

export function OfflineState({ hostId }: { hostId: string }) {
  const meta = useHostMeta(hostId);
  return (
    <EmptyState
      icon={CloudOff}
      title="Host offline"
      description={`${meta?.name ?? hostId} is not connected right now — reconnect it from Settings.`}
    />
  );
}

export function ListFooterLoader({ loading, label }: { loading: boolean; label?: string }) {
  if (!loading) {
    return <View className="h-8" />;
  }
  return (
    <View className="flex-row items-center justify-center gap-2 py-5">
      <ActivityIndicator size="small" color={palette.mutedForeground} />
      {label ? <Text className="text-muted-foreground text-xs">{label}</Text> : null}
    </View>
  );
}

export function InlineBusy({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-2 py-2">
      <ActivityIndicator size="small" color={palette.mutedForeground} />
      <Text className="text-muted-foreground text-xs">{label}</Text>
    </View>
  );
}
