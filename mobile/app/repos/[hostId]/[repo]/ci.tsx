import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  CirclePlay,
  RotateCw,
  ShieldCheck,
  ShieldQuestion,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { FlatList, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { EmptyState } from '~/components/empty-state';
import { ChecksList, ChecksSummary } from '~/components/repo/ci/checks-section';
import {
  useCiRefresh,
  useRepoCommitChecks,
  useWorkflowRuns,
} from '~/components/repo/ci/ci-queries';
import type { WorkflowRun } from '~/components/repo/ci/ci-types';
import { RunRow } from '~/components/repo/ci/run-row';
import { useRepoScope } from '~/components/repo/git-queries';
import { errorMessage } from '~/components/repo/git-types';
import { usePrCapabilities } from '~/components/repo/pr/pr-queries';
import { providerUnknownHost } from '~/components/repo/pr/pr-types';
import { OfflineState, QueryErrorState } from '~/components/repo/repo-states';
import { decodeRouteValue, useRepoRoute } from '~/lib/repo/route';
import { shortHash } from '~/components/shared/format';
import { SkeletonList } from '~/components/skeleton-list';
import { Glass, GlassCircle } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

const MODES = ['runs', 'checks'] as const;

type Mode = (typeof MODES)[number];

const MODE_LABEL: Record<Mode, string> = {
  runs: 'Workflow runs',
  checks: 'Head checks',
};

const MODE_ICON: Record<Mode, LucideIcon> = {
  runs: CirclePlay,
  checks: ShieldCheck,
};

const CHIP_SHAPE = {
  height: 36,
  borderRadius: 18,
  paddingHorizontal: 14,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 6,
};

function ModeChip({
  mode,
  active,
  onPress,
}: {
  mode: Mode;
  active: boolean;
  onPress: () => void;
}) {
  const inner = (
    <>
      <Icon
        as={MODE_ICON[mode]}
        size={13}
        color={active ? palette.primaryForeground : palette.foreground}
      />
      <Text
        className={
          active
            ? 'text-primary-foreground text-sm font-semibold'
            : 'text-foreground text-sm font-medium'
        }>
        {MODE_LABEL[mode]}
      </Text>
    </>
  );
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={MODE_LABEL[mode]}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {active ? (
        <View style={[CHIP_SHAPE, { backgroundColor: palette.primary }]}>{inner}</View>
      ) : (
        <Glass style={CHIP_SHAPE}>{inner}</Glass>
      )}
    </Pressable>
  );
}

function ModeToggle({ value, onChange }: { value: Mode; onChange: (next: Mode) => void }) {
  return (
    <View className="flex-row items-center gap-2">
      {MODES.map((mode) => (
        <ModeChip
          key={mode}
          mode={mode}
          active={mode === value}
          onPress={() => {
            if (mode === value) {
              return;
            }
            if (Platform.OS !== 'web') {
              void Haptics.selectionAsync();
            }
            onChange(mode);
          }}
        />
      ))}
    </View>
  );
}

export default function RepoCiScreen() {
  const router = useRouter();
  const { hostId, repoPath } = useRepoRoute();
  const params = useLocalSearchParams<{ runId?: string }>();
  const deepLinkRunId = decodeRouteValue(params.runId);
  const scope = useRepoScope(hostId, repoPath);
  const [mode, setMode] = React.useState<Mode>('runs');

  const caps = usePrCapabilities(scope);
  const workflowsSupported = caps.data ? caps.data.can_workflows : true;
  const runs = useWorkflowRuns(scope, workflowsSupported);
  const commitChecks = useRepoCommitChecks(scope);
  const refresh = useCiRefresh(scope);

  const openRun = React.useCallback(
    (runId: number) => {
      router.push({
        pathname: '/repos/[hostId]/[repo]/ci/[runId]',
        params: { hostId, repo: repoPath, runId: String(runId) },
      });
    },
    [hostId, repoPath, router]
  );

  const handled = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!deepLinkRunId || handled.current === deepLinkRunId) {
      return;
    }
    const parsed = Number.parseInt(deepLinkRunId, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    handled.current = deepLinkRunId;
    openRun(parsed);
  }, [deepLinkRunId, openRun]);

  const renderItem = React.useCallback(
    ({ item, index }: { item: WorkflowRun; index: number }) => (
      <RunRow
        run={item}
        first={index === 0}
        last={index === (runs.data?.length ?? 0) - 1}
        onPress={openRun}
      />
    ),
    [openRun, runs.data?.length]
  );

  if (!scope.online) {
    return (
      <View className="bg-background flex-1">
        <OfflineState hostId={hostId} />
      </View>
    );
  }

  const active = mode === 'runs' ? runs : commitChecks;
  const unknownHost = active.isError ? providerUnknownHost(errorMessage(active.error)) : null;
  const headSha = commitChecks.data?.head_sha?.trim() ?? '';

  return (
    <View className="bg-background flex-1">
      <View className="flex-row items-center justify-between gap-3 px-5 pb-3 pt-1">
        <ModeToggle value={mode} onChange={setMode} />
        <View className="flex-row items-center gap-3">
          {mode === 'checks' && headSha.length > 0 ? (
            <Text className="text-muted-foreground font-mono text-2xs">
              {shortHash(headSha)}
            </Text>
          ) : null}
          <GlassCircle
            icon={RotateCw}
            label="Reload CI"
            size={36}
            color={active.isFetching ? palette.foreground : palette.mutedForeground}
            onPress={refresh}
          />
        </View>
      </View>

      {mode === 'runs' && !workflowsSupported ? (
        <EmptyState
          icon={ShieldQuestion}
          title="Workflow runs are not available"
          description={`${caps.data?.label ?? 'This provider'} does not expose workflow runs — switch to head checks instead.`}
        />
      ) : active.isError ? (
        <View className="px-5">
          <QueryErrorState
            title={
              unknownHost
                ? `No provider configured for ${unknownHost}`
                : mode === 'runs'
                  ? 'Could not load workflow runs'
                  : 'Could not load checks'
            }
            error={active.error}
            onRetry={() => void active.refetch()}
          />
        </View>
      ) : active.isPending ? (
        <View className="px-5 pt-1">
          <SkeletonList rows={6} />
        </View>
      ) : mode === 'checks' ? (
        <ScrollView
          contentContainerClassName="gap-3 px-5 pb-28"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={commitChecks.isRefetching}
              onRefresh={refresh}
              tintColor={palette.mutedForeground}
            />
          }>
          <ChecksSummary checks={commitChecks.data?.checks ?? []} />
          <ChecksList checks={commitChecks.data?.checks ?? []} />
        </ScrollView>
      ) : (runs.data?.length ?? 0) === 0 ? (
        <Animated.View entering={FadeIn.duration(180)} className="flex-1">
          <EmptyState
            icon={CirclePlay}
            title="No workflow runs"
            description="Nothing has run on this repository yet."
          />
        </Animated.View>
      ) : (
        <FlatList
          data={runs.data ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerClassName="px-5 pb-28"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={runs.isRefetching}
              onRefresh={refresh}
              tintColor={palette.mutedForeground}
            />
          }
        />
      )}
    </View>
  );
}
