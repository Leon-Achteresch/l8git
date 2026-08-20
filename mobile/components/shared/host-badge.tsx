import { View } from 'react-native';

import { catColor } from '~/components/shared/icon-badge';
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
  const color = catColor(hostId);
  const offline = showStatus && runtime.status !== 'online';

  return (
    <View
      className={cn(
        'border-border bg-muted/70 flex-row items-center gap-1.5 rounded-full border',
        size === 'xs' ? 'px-1.5 py-px' : 'px-2 py-0.5',
        className
      )}>
      <View
        style={{ backgroundColor: color, opacity: offline ? 0.35 : 1 }}
        className={size === 'xs' ? 'h-1.5 w-1.5 rounded-full' : 'h-2 w-2 rounded-full'}
      />
      {showName ? (
        <Text
          numberOfLines={1}
          className={cn(
            'text-muted-foreground max-w-32 font-medium',
            size === 'xs' ? 'text-2xs' : 'text-xs',
            offline && 'opacity-70'
          )}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
