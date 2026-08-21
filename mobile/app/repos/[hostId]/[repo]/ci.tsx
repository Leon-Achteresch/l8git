import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { PlayCircle, RotateCw, ShieldQuestion } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

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
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

const MODES = ['runs', 'checks'] as const;

type Mode = (typeof MODES)[number];

const MODE_LABEL: Record<Mode, string> = {
  runs: 'Workflow runs',
  checks: 'Head checks',
};

function ModeToggle({ value, onChange }: { value: Mode; onChange: (next: Mode) => void }) {
  return (
    <View className="border-border bg-muted/50 flex-row rounded-lg border p-0.5">
      {MODES.map((mode) => {
        const active = mode === value;
        return (
          <Pressable
            key={mode}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) {
                return;
              }
              if (Platform.OS !== 'web') {
                void Haptics.selectionAsync();
              }
              onChange(mode);
            }}
            className="rounded-md">
            <Animated.View
              layout={LinearTransition.duration(160)}
              className={cn('rounded-md px-2.5 py-1', active && 'bg-foreground')}>
              <Text
                className={cn(
                  'text-2xs font-medium',
                  active ? 'text-background' : 'text-muted-foreground'
                )}>
                {MODE_LABEL[mode]}
              </Text>
            </Animated.View>
          </Pressable>
        );
      })}
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
      <View className="flex-row items-center justify-between gap-2 px-4 pb-2 pt-1">
        <ModeToggle value={mode} onChange={setMode} />
        <View className="flex-row items-center gap-2">
          {mode === 'checks' && headSha.length > 0 ? (
            <Text className="text-muted-foreground/70 font-mono text-2xs">
              {shortHash(headSha)}
            </Text>
          ) : null}
          <Pressable
            accessibilityLabel="Reload CI"
            hitSlop={10}
            onPress={refresh}
            className="active:bg-accent h-8 w-8 items-center justify-center rounded-lg">
            <Icon
              as={RotateCw}
              size={15}
              className={active.isFetching ? 'text-foreground' : 'text-muted-foreground'}
            />
          </Pressable>
        </View>
      </View>

      {mode === 'runs' && !workflowsSupported ? (
        <EmptyState
          icon={ShieldQuestion}
          title="Workflow runs are not available"
          description={`${caps.data?.label ?? 'This provider'} does not expose workflow runs — switch to head checks instead.`}
        />
      ) : active.isError ? (
        <View className="px-4">
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
        <View className="px-4 pt-1">
          <SkeletonList rows={6} />
        </View>
      ) : mode === 'checks' ? (
        <ScrollView
          contentContainerClassName="gap-2 px-4 pb-24"
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
            icon={PlayCircle}
            title="No workflow runs"
            description="Nothing has run on this repository yet."
          />
        </Animated.View>
      ) : (
        <FlatList
          data={runs.data ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerClassName="px-4 pb-24"
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
