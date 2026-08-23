import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import {
  Archive,
  ArrowLeft,
  Clock4,
  FileDiff,
  GitBranch,
  GitPullRequest,
  Workflow,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { initials } from '~/components/shared/format';
import { Fade, Glass, GlassCircle } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { useHostMeta, useHostRuntime } from '~/lib/connections';
import { illustrations, illustrationsLarge } from '~/lib/illustrations';
import { useRepoStatus } from '~/lib/repo/queries';
import { REPO_SECTIONS, REPO_SECTION_LABEL, type RepoSection } from '~/lib/repo/route';
import { palette } from '~/lib/theme';

const SECTION_ICON: Record<RepoSection, LucideIcon> = {
  index: FileDiff,
  history: Clock4,
  branches: GitBranch,
  stash: Archive,
  pr: GitPullRequest,
  ci: Workflow,
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text className="text-muted-foreground text-xs">{label}</Text>
      <Text style={{ fontVariant: ['tabular-nums'] }} className="text-foreground text-xl font-bold">
        {value}
      </Text>
    </View>
  );
}

function SectionChip({
  section,
  active,
  onPress,
}: {
  section: RepoSection;
  active: boolean;
  onPress: () => void;
}) {
  const inner = (
    <>
      <Icon
        as={SECTION_ICON[section]}
        size={13}
        color={active ? palette.primaryForeground : palette.foreground}
      />
      <Text
        className={
          active ? 'text-primary-foreground text-sm font-semibold' : 'text-foreground text-sm font-medium'
        }>
        {REPO_SECTION_LABEL[section]}
      </Text>
    </>
  );
  const shape = {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  };
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={REPO_SECTION_LABEL[section]}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {active ? (
        <View style={[shape, { backgroundColor: palette.primary }]}>{inner}</View>
      ) : (
        <Glass style={shape}>{inner}</Glass>
      )}
    </Pressable>
  );
}

export type RepoHeaderProps = {
  hostId: string;
  repoName: string;
  repoPath: string;
  branch?: string | null;
  ahead?: number;
  behind?: number;
  section: RepoSection;
  onSelect: (section: RepoSection) => void;
  onBack: () => void;
};

export function RepoHeader({
  hostId,
  repoName,
  repoPath,
  branch,
  ahead = 0,
  behind = 0,
  section,
  onSelect,
  onBack,
}: RepoHeaderProps) {
  const insets = useSafeAreaInsets();
  const host = useHostMeta(hostId);
  const runtime = useHostRuntime(hostId);
  const online = runtime.status === 'online';
  const status = useRepoStatus(hostId, repoPath, online);
  const changes = status.data?.entries.length ?? 0;

  const select = React.useCallback(
    (next: RepoSection) => {
      if (next === section) {
        return;
      }
      if (Platform.OS !== 'web') {
        void Haptics.selectionAsync();
      }
      onSelect(next);
    },
    [onSelect, section]
  );

  return (
    <View style={{ paddingTop: insets.top, overflow: 'hidden' }}>
      <Image
        source={illustrationsLarge.repo}
        contentFit="cover"
        blurRadius={70}
        style={[StyleSheet.absoluteFill, { opacity: 0.85 }]}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
      <Fade height={180} />

      <View className="flex-row items-center justify-between px-5 pt-2">
        <GlassCircle icon={ArrowLeft} label="Back" onPress={onBack} />
        <Glass
          style={{
            height: 44,
            borderRadius: 22,
            paddingLeft: 6,
            paddingRight: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.12)',
            }}>
            <Text className="text-foreground text-2xs font-bold">{initials(host?.name)}</Text>
          </View>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: online ? palette.success : palette.mutedForeground,
            }}
          />
        </Glass>
      </View>

      <View className="items-center gap-1.5 pt-4">
        <View
          style={{
            width: 92,
            height: 92,
            borderRadius: 46,
            borderWidth: 2,
            borderColor: 'rgba(255,255,255,0.28)',
            overflow: 'hidden',
            backgroundColor: palette.card,
          }}>
          <Image source={illustrations.repo} contentFit="cover" style={{ flex: 1 }} />
        </View>
        <Text numberOfLines={1} className="text-foreground pt-2 text-2xl font-bold tracking-tight">
          {repoName}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Icon as={GitBranch} size={12} color={palette.mutedForeground} />
          <Text numberOfLines={1} className="text-muted-foreground max-w-64 text-xs">
            {branch || repoPath}
          </Text>
        </View>
      </View>

      <View
        className="mx-5 mt-4 flex-row items-center py-3"
        style={{ borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <Stat label="Ahead" value={ahead} />
        <View style={{ width: StyleSheet.hairlineWidth, height: 28, backgroundColor: 'rgba(255,255,255,0.12)' }} />
        <Stat label="Behind" value={behind} />
        <View style={{ width: StyleSheet.hairlineWidth, height: 28, backgroundColor: 'rgba(255,255,255,0.12)' }} />
        <Stat label="Changes" value={changes} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingTop: 16, paddingBottom: 14 }}
        className="grow-0">
        {REPO_SECTIONS.map((item) => (
          <SectionChip key={item} section={item} active={item === section} onPress={() => select(item)} />
        ))}
      </ScrollView>
    </View>
  );
}
