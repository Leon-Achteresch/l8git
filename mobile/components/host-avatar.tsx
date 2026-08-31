import { View } from 'react-native';

import { initials } from '~/components/shared/format';
import { Text } from '~/components/ui/text';
import type { HostStatus } from '~/lib/connections';
import { palette } from '~/lib/theme';

export function hostRingColor(status?: HostStatus): string {
  if (status === 'online') {
    return palette.success;
  }
  if (status === 'connecting' || status === 'reconnecting') {
    return palette.warning;
  }
  if (status === 'error') {
    return palette.destructive;
  }
  return 'rgba(255,255,255,0.18)';
}

export function HostAvatar({
  name,
  size,
  status,
}: {
  name: string;
  size: number;
  status?: HostStatus;
}) {
  const ring = hostRingColor(status);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: ring,
        padding: 2,
      }}>
      <View
        style={{
          flex: 1,
          borderRadius: (size - 8) / 2,
          overflow: 'hidden',
          backgroundColor: palette.elevated,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text className="font-bold text-white" style={{ fontSize: Math.round(size * 0.28) }}>
          {initials(name)}
        </Text>
      </View>
    </View>
  );
}
