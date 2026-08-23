import { ArrowDown, ArrowUp, GitBranch, TriangleAlert } from 'lucide-react-native';
import { Image, Pressable, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Sparkline } from '~/components/dashboard/sparkline';
import type { RepoOverview } from '~/components/dashboard/queries';
import { relativeTime } from '~/components/shared/format';
import { illustrations } from '~/lib/illustrations';
import { palette } from '~/lib/theme';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

const NUM = { fontVariant: ['tabular-nums' as const] };

const TILE = {
  gap: 12,
  overflow: 'hidden' as const,
  borderRadius: 28,
  paddingHorizontal: 16,
  paddingVertical: 16,
};

export function RepoTile({
  repo,
  accent,
  selected,
  index,
  onPress,
  onOpen,
}: {
  repo: RepoOverview;
  accent: string;
  selected: boolean;
  index: number;
  onPress: () => void;
  onOpen?: () => void;
}) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.016 }],
    opacity: 1 - pressed.value * 0.18,
  }));

  const millis =
    repo.last_commit_at === null
      ? null
      : repo.last_commit_at < 1e12
        ? repo.last_commit_at * 1000
        : repo.last_commit_at;

  return (
    <Animated.View
      entering={FadeInDown.duration(240).delay(Math.min(index, 8) * 45)}
      style={[animatedStyle, { width: '48%' }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`Select ${repo.name || repo.path}`}
        accessibilityHint={onOpen ? 'Long press to open this repository' : undefined}
        onPress={onPress}
        onLongPress={onOpen}
        delayLongPress={280}
        onPressIn={() => {
          pressed.value = withTiming(1, { duration: 90 });
        }}
        onPressOut={() => {
          pressed.value = withTiming(0, { duration: 180 });
        }}
        style={[
          TILE,
          { backgroundColor: selected ? 'rgba(255,255,255,0.12)' : palette.card },
        ]}>
        <View className="flex-row items-center gap-2">
          <Image
            source={illustrations.repo}
            resizeMode="cover"
            style={{ width: 34, height: 34, borderRadius: 17 }}
          />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-foreground text-sm font-semibold">
              {repo.name || repo.path}
            </Text>
          </View>
          {repo.dirty_count > 0 ? (
            <View
              style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.warning }}
            />
          ) : null}
        </View>

        {repo.error ? (
          <View className="flex-row items-center gap-1.5 py-2">
            <Icon as={TriangleAlert} className="text-destructive size-3" />
            <Text numberOfLines={2} className="text-muted-foreground flex-1 text-2xs">
              {repo.error}
            </Text>
          </View>
        ) : (
          <>
            <View
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 4,
                backgroundColor: 'rgba(255,255,255,0.08)',
              }}>
              <Icon as={GitBranch} size={11} color={palette.mutedForeground} />
              <Text numberOfLines={1} className="text-muted-foreground max-w-24 text-2xs">
                {repo.branch || 'detached'}
              </Text>
            </View>

            <Sparkline values={repo.commits_last_30d} accent={accent} height={26} />

            <View className="flex-row items-center gap-3">
              <Counter icon={ArrowUp} value={repo.ahead} tone="text-git-added" />
              <Counter icon={ArrowDown} value={repo.behind} tone="text-git-removed" />
              <View className="flex-1" />
              <Text style={NUM} className="text-muted-foreground text-2xs">
                {repo.dirty_count > 0 ? `${repo.dirty_count} dirty` : 'clean'}
              </Text>
            </View>

            <Text numberOfLines={1} className="text-muted-foreground/70 text-2xs">
              {millis ? relativeTime(millis) : 'no commits'}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

function Counter({
  icon,
  value,
  tone,
}: {
  icon: typeof ArrowUp;
  value: number;
  tone: string;
}) {
  return (
    <View className="flex-row items-center gap-1">
      <Icon as={icon} className={cn('size-4', value > 0 ? tone : 'text-muted-foreground/40')} />
      <Text
        style={NUM}
        className={cn(
          'text-lg font-bold',
          value > 0 ? 'text-foreground' : 'text-muted-foreground/40'
        )}>
        {value}
      </Text>
    </View>
  );
}
