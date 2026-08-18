import { View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

import { Skeleton } from '~/components/ui/skeleton';

function RepoBlock({ rows }: { rows: number }) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2 px-1">
        <Skeleton className="h-3 w-3 rounded" />
        <Skeleton className="h-3 w-28 rounded" />
        <View className="flex-1" />
        <Skeleton className="h-3 w-10 rounded-full" />
      </View>
      <View className="border-border overflow-hidden rounded-xl border">
        {Array.from({ length: rows }).map((_, index) => (
          <View
            key={index}
            className={`bg-card/50 flex-row items-start gap-3 px-3 py-3 ${index > 0 ? 'border-border border-t' : ''}`}>
            <Skeleton className="h-7 w-7 rounded-lg" />
            <View className="flex-1 gap-2">
              <Skeleton className={`h-3 rounded ${index % 2 === 0 ? 'w-3/5' : 'w-2/5'}`} />
              <Skeleton className="h-2.5 w-2/3 rounded" />
            </View>
            <Skeleton className="h-2.5 w-8 rounded" />
          </View>
        ))}
      </View>
    </View>
  );
}

export function AgentsOverviewSkeleton() {
  return (
    <Animated.View exiting={FadeOut.duration(140)} className="gap-4">
      <View className="flex-row gap-2">
        {[64, 88, 76, 60].map((width) => (
          <Skeleton key={width} style={{ width }} className="h-7 rounded-full" />
        ))}
      </View>
      <Skeleton className="h-24 rounded-2xl" />
      <RepoBlock rows={3} />
      <RepoBlock rows={2} />
    </Animated.View>
  );
}
