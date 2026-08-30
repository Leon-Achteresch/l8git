import { Clock4, FileText } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { HostAvatar } from '~/components/host-avatar';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import type { HostStatus } from '~/lib/connections';
import { palette } from '~/lib/theme';

export function ConnectedHostCard({
  name,
  records,
  recency,
  status,
  onPress,
}: {
  name: string;
  records: number;
  recency: string;
  status?: HostStatus;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${records} repositories`}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 268,
        borderRadius: 28,
        backgroundColor: palette.card,
        padding: 14,
        flexDirection: 'row',
        gap: 12,
        opacity: pressed ? 0.86 : 1,
      })}>
      <HostAvatar name={name} size={56} status={status} />
      <View className="min-w-0 flex-1 justify-center gap-1">
        <Text numberOfLines={1} className="text-foreground text-base font-semibold">
          {name}
        </Text>
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1">
            <Icon as={FileText} size={11} color={palette.mutedForeground} strokeWidth={1.7} />
            <Text style={{ fontVariant: ['tabular-nums'] }} className="text-muted-foreground text-2xs">
              {`${records} ${records === 1 ? 'repo' : 'repos'}`}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Icon as={Clock4} size={11} color={palette.mutedForeground} strokeWidth={1.7} />
            <Text numberOfLines={1} className="text-muted-foreground text-2xs">
              {recency}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
