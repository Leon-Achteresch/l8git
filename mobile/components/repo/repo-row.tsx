import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDown, ArrowUp, GitBranch } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { splitPath } from '~/components/shared/format';
import { Glass } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { illustrationsLarge } from '~/lib/illustrations';
import type { RepoOverview } from '~/lib/repo/types';
import { palette } from '~/lib/theme';

const ART = [
  illustrationsLarge.repo,
  illustrationsLarge.dashboard,
  illustrationsLarge.agent,
  illustrationsLarge.inbox,
  illustrationsLarge.host,
];

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
  index = 0,
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
      }}>
      <Image
        source={ART[index % ART.length]}
        contentFit="cover"
        contentPosition="top"
        style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.3 }, { translateY: -14 }] }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.97)']}
        locations={[0.3, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={{ position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 5 }}>
        <Glass
          style={{
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
      </View>
      {overview.dirty_count > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: palette.warning,
            borderWidth: 2,
            borderColor: 'rgba(0,0,0,0.5)',
          }}
        />
      ) : null}

      <View style={{ flex: 1, justifyContent: 'flex-end', padding: 12, gap: 3 }}>
        <Text numberOfLines={1} className="text-lg font-bold text-white">
          {name}
        </Text>
        {overview.error ? (
          <Text numberOfLines={1} className="text-destructive text-2xs">
            {overview.error}
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon as={GitBranch} size={10} color="rgba(255,255,255,0.75)" />
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.75)', flex: 1 }} className="text-2xs">
              {overview.branch || 'detached'}
            </Text>
            {overview.dirty_count > 0 ? (
              <Text style={{ fontVariant: ['tabular-nums'], color: palette.warning }} className="text-2xs font-semibold">
                {overview.dirty_count} dirty
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </Pressable>
  );
});
