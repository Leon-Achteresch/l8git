import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, Clock4, FolderOpen, GitBranch, Plus } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { initials } from '~/components/shared/format';
import { Glass, GlassPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { useConnections } from '~/lib/connections';
import { illustrationsLarge } from '~/lib/illustrations';
import { repoLink, repoSectionHref } from '~/lib/repo/route';
import type { RepoOverview } from '~/lib/repo/types';
import { palette } from '~/lib/theme';

const STORY_GRADIENTS: [string, string][] = [
  ['#ff6b57', '#bf5af2'],
  ['#0a84ff', '#40c8e0'],
  ['#34c759', '#ffd60a'],
  ['#ff2d92', '#ff9f0a'],
];

const CARD_ART = [
  illustrationsLarge.repo,
  illustrationsLarge.dashboard,
  illustrationsLarge.agent,
  illustrationsLarge.inbox,
  illustrationsLarge.host,
];

export function HostStories() {
  const router = useRouter();
  const hosts = useConnections((state) => state.hosts);
  const runtime = useConnections((state) => state.runtime);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add host"
        onPress={() => router.push('/settings')}
        style={({ pressed }) => ({ alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
        <View
          style={{
            width: 66,
            height: 66,
            borderRadius: 33,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: 'rgba(255,255,255,0.32)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Glass
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon as={Plus} size={20} color={palette.foreground} />
          </Glass>
        </View>
        <Text className="text-muted-foreground text-2xs">Add host</Text>
      </Pressable>

      {hosts.map((host, index) => {
        const status = runtime[host.hostId]?.status ?? 'idle';
        const ring =
          status === 'online'
            ? palette.success
            : status === 'connecting' || status === 'reconnecting'
              ? palette.warning
              : 'rgba(255,255,255,0.18)';
        return (
          <Pressable
            key={host.hostId}
            accessibilityRole="button"
            accessibilityLabel={`${host.name}, ${status}`}
            onPress={() => router.push('/settings')}
            style={({ pressed }) => ({ alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
            <View
              style={{
                width: 66,
                height: 66,
                borderRadius: 33,
                borderWidth: 2,
                borderColor: ring,
                padding: 3,
              }}>
              <LinearGradient
                colors={STORY_GRADIENTS[index % STORY_GRADIENTS.length]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  flex: 1,
                  borderRadius: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text className="text-base font-bold text-white">{initials(host.name)}</Text>
              </LinearGradient>
            </View>
            <Text numberOfLines={1} style={{ maxWidth: 66 }} className="text-muted-foreground text-2xs">
              {host.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

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
  index,
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
        width: 248,
        height: 330,
        borderRadius: 32,
        overflow: 'hidden',
        backgroundColor: palette.card,
      }}>
      <Image
        source={CARD_ART[index % CARD_ART.length]}
        contentFit="cover"
        contentPosition="top"
        style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.25 }, { translateY: -20 }] }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.96)']}
        locations={[0.3, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${overview.name}`}
        onPress={open}
        style={StyleSheet.absoluteFill}
      />

      <View style={{ position: 'absolute', top: 14, left: 14, flexDirection: 'row', gap: 6 }}>
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

      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'flex-end', padding: 16, gap: 12 }}>
        <View style={{ gap: 4 }}>
          <Text numberOfLines={1} className="text-2xl font-bold text-white">
            {overview.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon as={GitBranch} size={12} color="rgba(255,255,255,0.8)" />
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.8)' }} className="text-xs">
              {overview.error ? 'unavailable' : overview.branch || 'detached'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <GlassPill icon={FolderOpen} label="Open" onPress={open} style={{ flex: 1 }} />
          <GlassPill icon={Clock4} label="History" onPress={history} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}
