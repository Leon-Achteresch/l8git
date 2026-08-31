import { ArrowDown, ArrowUp, GitBranch } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { splitPath } from '~/components/shared/format';
import { Glass } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import type { RepoOverview } from '~/lib/repo/types';
import { palette } from '~/lib/theme';

export type RepoTileProps = {
  overview: RepoOverview;
  index?: number;
  onPress?: () => void;
  onLongPress?: () => void;
};

function Counter({ icon, value }: { icon: typeof ArrowUp; value: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Icon as={icon} size={10} color={palette.foreground} />
      <Text style={{ fontVariant: ['tabular-nums'] }} className="text-foreground text-2xs font-semibold">
        {value}
      </Text>
    </View>
  );
}

export const RepoTile = React.memo(function RepoTile({
  overview,
  onPress,
  onLongPress,
}: RepoTileProps) {
  const name = overview.name || splitPath(overview.path).name;
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor((width - 40 - 12) / 2);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        width: tileWidth,
        height: 212,
        borderRadius: 28,
        overflow: 'hidden',
        backgroundColor: palette.card,
        padding: 12,
        justifyContent: 'space-between',
      }}>
      <Glass
        style={{
          alignSelf: 'flex-start',
          height: 26,
          borderRadius: 13,
          paddingHorizontal: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}>
        <Counter icon={ArrowUp} value={overview.ahead} />
        <Counter icon={ArrowDown} value={overview.behind} />
      </Glass>
      <View style={{ gap: 3 }}>
        <Text numberOfLines={2} className="text-lg font-bold text-white">
          {name}
        </Text>
        {overview.error ? (
          <Text numberOfLines={1} className="text-destructive text-2xs">
            {overview.error}
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon as={GitBranch} size={10} color={palette.mutedForeground} />
            <Text numberOfLines={1} className="text-muted-foreground flex-1 text-2xs">
              {overview.branch || 'detached'}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});
