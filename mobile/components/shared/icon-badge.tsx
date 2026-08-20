import * as React from 'react';
import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { Icon } from '~/components/ui/icon';
import { palette } from '~/lib/theme';

const SIZES = {
  sm: { box: 32, icon: 16, radius: 10 },
  md: { box: 40, icon: 20, radius: 13 },
  lg: { box: 48, icon: 23, radius: 16 },
} as const;

export type IconBadgeSize = keyof typeof SIZES;

export function catColor(seed: string | null | undefined): string {
  const cats = Object.values(palette.cat);
  if (!seed) {
    return cats[0];
  }
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return cats[h % cats.length];
}

export function IconBadge({
  icon,
  color = palette.cat.coral,
  size = 'md',
  solid = false,
}: {
  icon: LucideIcon;
  color?: string;
  size?: IconBadgeSize;
  solid?: boolean;
}) {
  const s = SIZES[size];
  return (
    <View
      style={{
        width: s.box,
        height: s.box,
        borderRadius: s.radius,
        backgroundColor: solid ? color : `${color}26`,
      }}
      className="items-center justify-center">
      <Icon as={icon} size={s.icon} color={solid ? palette.background : color} />
    </View>
  );
}
