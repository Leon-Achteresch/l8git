import { useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, Clock4, FolderOpen, GitBranch } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Glass, SolidPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { repoLink, repoSectionHref } from '~/lib/repo/route';
import type { RepoOverview } from '~/lib/repo/types';
import { palette } from '~/lib/theme';

export const REPO_CARD_WIDTH = 268;
export const REPO_CARD_GAP = 12;

function Counter({ icon, value }: { icon: typeof ArrowUp; value: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Icon as={icon} size={11} color={palette.foreground} />
      <Text style={{ fontVariant: ['tabular-nums'] }} className="text-foreground text-xs font-semibold">
        {value}
      </Text>
    </View>
  );
}

export function RepoCard({
  hostId,
  overview,
}: {
  hostId: string;
  overview: RepoOverview;
  index: number;
}) {
  const router = useRouter();
  const open = () => router.push(repoLink(hostId, overview.path));
  const history = () => router.push(repoSectionHref('history', hostId, overview.path));

  return (
    <View
      style={{
        width: REPO_CARD_WIDTH,
        height: 380,
        borderRadius: 32,
        overflow: 'hidden',
        backgroundColor: palette.card,
        padding: 16,
        justifyContent: 'space-between',
      }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Glass
          style={{
            height: 30,
            borderRadius: 15,
            paddingHorizontal: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
          <Counter icon={ArrowUp} value={overview.ahead} />
          <Counter icon={ArrowDown} value={overview.behind} />
        </Glass>
        {overview.dirty_count > 0 ? (
          <Glass
            style={{
              height: 30,
              borderRadius: 15,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
            }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: palette.warning }} />
            <Text style={{ fontVariant: ['tabular-nums'] }} className="text-foreground text-xs font-semibold">
              {overview.dirty_count} dirty
            </Text>
          </Glass>
        ) : null}
      </View>
      <View style={{ gap: 10 }}>
        <View style={{ gap: 4 }}>
          <Text numberOfLines={2} className="text-2xl font-bold text-white">
            {overview.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon as={GitBranch} size={12} color={palette.mutedForeground} />
            <Text numberOfLines={1} className="text-muted-foreground text-xs">
              {overview.error ? 'unavailable' : overview.branch || 'detached'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SolidPill icon={FolderOpen} label="Open" onPress={open} style={{ flex: 1, height: 44 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="History"
            onPress={history}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.12)',
              opacity: pressed ? 0.7 : 1,
            })}>
            <Icon as={Clock4} size={16} color={palette.foreground} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
