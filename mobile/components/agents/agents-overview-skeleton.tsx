import { View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

import { Skeleton } from '~/components/ui/skeleton';

function RepoBlock({ rows }: { rows: number }) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2.5 px-1">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-32 rounded-full" />
        <View className="flex-1" />
        <Skeleton className="h-3 w-8 rounded-full" />
      </View>
      <View className="bg-card overflow-hidden rounded-3xl">
        {Array.from({ length: rows }).map((_, index) => (
          <View
            key={index}
            className={`flex-row items-start gap-3 px-4 py-3.5 ${index > 0 ? 'border-white/5 border-t' : ''}`}>
            <Skeleton className="bg-white/10 h-10 w-10 rounded-full" />
            <View className="flex-1 gap-2 pt-1">
              <Skeleton className={`bg-white/10 h-3 rounded-full ${index % 2 === 0 ? 'w-3/5' : 'w-2/5'}`} />
              <Skeleton className="bg-white/[0.06] h-2.5 w-2/3 rounded-full" />
            </View>
            <Skeleton className="bg-white/[0.06] h-2.5 w-8 rounded-full" />
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
          <Skeleton key={width} style={{ width }} className="h-9 rounded-full" />
        ))}
      </View>
      <Skeleton className="h-24 rounded-[28px]" />
      <RepoBlock rows={3} />
      <RepoBlock rows={2} />
    </Animated.View>
  );
}
