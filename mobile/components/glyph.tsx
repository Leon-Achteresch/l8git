import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '~/components/ui/icon';
import { palette } from '~/lib/theme';

export function Glyph({
  icon,
  size = 40,
  color = palette.foreground,
  background = 'rgba(255,255,255,0.10)',
}: {
  icon: LucideIcon;
  size?: number;
  color?: string;
  background?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.36),
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Icon as={icon} size={Math.round(size * 0.46)} color={color} strokeWidth={1.8} />
    </View>
  );
}
