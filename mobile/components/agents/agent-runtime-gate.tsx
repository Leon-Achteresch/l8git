import { TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { EmptyState } from '~/components/empty-state';
import { SkeletonList } from '~/components/skeleton-list';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { retryAgentRuntime, useAgentRuntimeBoot } from '~/lib/agents/runtime';

export function AgentRuntimeSkeleton() {
  return (
    <Animated.View exiting={FadeOut.duration(140)} className="gap-4">
      <View className="flex-row gap-2">
        {['a', 'b', 'c', 'd'].map((key) => (
          <Skeleton key={key} className="h-8 flex-1 rounded-full" />
        ))}
      </View>
      <SkeletonList rows={5} avatar />
    </Animated.View>
  );
}

export function AgentRuntimeGate({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { phase, error } = useAgentRuntimeBoot();

  if (phase === 'error') {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Agent runtime failed to start"
        description={error ?? 'The agent stores could not be initialised on this device.'}
        action={
          <Button variant="outline" size="sm" onPress={retryAgentRuntime}>
            <Text>Try again</Text>
          </Button>
        }
      />
    );
  }

  if (phase !== 'ready') {
    return <>{fallback ?? <AgentRuntimeSkeleton />}</>;
  }

  return (
    <Animated.View entering={FadeIn.duration(180)} className="flex-1">
      {children}
    </Animated.View>
  );
}
