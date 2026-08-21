import { View } from 'react-native';

import { initials } from '~/components/shared/format';
import { Text } from '~/components/ui/text';
import { useHostMeta, useHostRuntime } from '~/lib/connections';
import { cn } from '~/lib/utils';

export type HostBadgeProps = {
  hostId: string;
  name?: string;
  size?: 'xs' | 'sm';
  showName?: boolean;
  showStatus?: boolean;
  className?: string;
};

export function HostBadge({
  hostId,
  name,
  size = 'sm',
  showName = true,
  showStatus = false,
  className,
}: HostBadgeProps) {
  const meta = useHostMeta(hostId);
  const runtime = useHostRuntime(showStatus ? hostId : null);
  const label = name ?? meta?.name ?? hostId;
  const online = runtime.status === 'online';
  const connecting = runtime.status === 'connecting' || runtime.status === 'reconnecting';
  const mono = initials(label);

  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5',
        showName && 'bg-secondary rounded-full',
        showName && (size === 'xs' ? 'py-px pl-px pr-2' : 'py-0.5 pl-0.5 pr-2.5'),
        className
      )}>
      <View className="relative">
        <View
          className={cn(
            'bg-muted items-center justify-center rounded-full',
            size === 'xs' ? 'h-4 w-4' : 'h-6 w-6'
          )}>
          <Text
            className={cn(
              'text-muted-foreground font-bold',
              size === 'xs' ? 'text-[8px]' : 'text-2xs'
            )}>
            {mono}
          </Text>
        </View>
        {showStatus ? (
          <View
            className={cn(
              'border-background absolute -bottom-px -right-px rounded-full border-2',
              size === 'xs' ? 'h-2 w-2' : 'h-2.5 w-2.5',
              online ? 'bg-success' : connecting ? 'bg-warning' : 'bg-muted-foreground'
            )}
          />
        ) : null}
      </View>
      {showName ? (
        <Text
          numberOfLines={1}
          className={cn(
            'text-foreground max-w-32 font-medium',
            size === 'xs' ? 'text-2xs' : 'text-xs',
            !online && showStatus && 'opacity-70'
          )}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
