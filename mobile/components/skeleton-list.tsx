import { View } from 'react-native';

import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';

export function SkeletonList({
  rows = 6,
  avatar = false,
  className,
}: {
  rows?: number;
  avatar?: boolean;
  className?: string;
}) {
  return (
    <View className={cn('border-border overflow-hidden rounded-lg border', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={index}
          className={cn(
            'bg-card/60 border-border flex-row items-center gap-3 px-3 py-3',
            index > 0 && 'border-t'
          )}>
          {avatar ? <Skeleton className="h-8 w-8 rounded-full" /> : null}
          <View className="flex-1 gap-2">
            <Skeleton className={cn('h-3 rounded', index % 3 === 0 ? 'w-2/3' : 'w-1/2')} />
            <Skeleton className={cn('h-2.5 rounded', index % 2 === 0 ? 'w-1/3' : 'w-2/5')} />
          </View>
          <Skeleton className="h-2.5 w-10 rounded" />
        </View>
      ))}
    </View>
  );
}
