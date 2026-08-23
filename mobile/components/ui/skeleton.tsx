import { cn } from '~/lib/utils';
import { View } from 'react-native';

function Skeleton({
  className,
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  return <View className={cn('bg-white/10 animate-pulse rounded-2xl', className)} {...props} />;
}

export { Skeleton };
