import * as Haptics from 'expo-haptics';
import { ChevronLeft, GitBranch } from 'lucide-react-native';
import * as React from 'react';
import { Image, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { HostBadge } from '~/components/shared/host-badge';
import { StatusPill } from '~/components/shared/status-pill';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { illustrations } from '~/lib/illustrations';
import { REPO_SECTIONS, REPO_SECTION_LABEL, type RepoSection } from '~/lib/repo/route';
import { cn } from '~/lib/utils';

const SPRING = { damping: 20, stiffness: 240, mass: 0.6 } as const;

function SegmentButton({
  section,
  active,
  onPress,
}: {
  section: RepoSection;
  active: boolean;
  onPress: () => void;
}) {
  const value = useSharedValue(active ? 1 : 0);

  React.useEffect(() => {
    value.value = withSpring(active ? 1 : 0, SPRING);
  }, [active, value]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: value.value,
    transform: [{ scaleX: 0.85 + value.value * 0.15 }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className="px-1">
      <View className="h-9 justify-center px-4">
        <Animated.View
          pointerEvents="none"
          style={pillStyle}
          className="bg-primary absolute bottom-0 left-0 right-0 top-0 rounded-full"
        />
        <Text
          className={cn(
            'text-sm tracking-wide',
            active ? 'text-primary-foreground font-semibold' : 'text-muted-foreground'
          )}>
          {REPO_SECTION_LABEL[section]}
        </Text>
      </View>
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
    <View className="gap-2 pb-2">
      <View className="flex-row items-center gap-2 px-2 pt-1">
        <Button size="icon" variant="ghost" accessibilityLabel="Back" onPress={onBack}>
          <Icon as={ChevronLeft} className="text-foreground size-5" />
        </Button>
        <Image
          source={illustrations.repo}
          resizeMode="cover"
          style={{ width: 40, height: 40, borderRadius: 13 }}
        />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-foreground text-2xl font-bold tracking-tight">
            {repoName}
          </Text>
          <View className="flex-row items-center gap-2">
            {branch ? (
              <View className="bg-secondary flex-row items-center gap-1 rounded-full px-2 py-0.5">
                <Icon as={GitBranch} size={11} className="text-muted-foreground" />
                <Text numberOfLines={1} className="text-muted-foreground max-w-40 text-2xs font-semibold">
                  {branch}
                </Text>
              </View>
            ) : (
              <Text numberOfLines={1} className="text-muted-foreground/60 max-w-48 text-2xs">
                {repoPath}
              </Text>
            )}
            {behind > 0 ? <StatusPill label={`↓${behind}`} tone="info" size="xs" mono /> : null}
            {ahead > 0 ? <StatusPill label={`↑${ahead}`} tone="added" size="xs" mono /> : null}
          </View>
        </View>
        <View className="pr-2">
          <HostBadge hostId={hostId} size="xs" showStatus />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-3"
        className="grow-0">
        {REPO_SECTIONS.map((item) => (
          <SegmentButton
            key={item}
            section={item}
            active={item === section}
            onPress={() => select(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
