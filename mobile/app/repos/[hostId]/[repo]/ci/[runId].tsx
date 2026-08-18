import { useLocalSearchParams } from 'expo-router';
import {
  CircleSlash,
  ExternalLink,
  GitBranch,
  RotateCw,
  Timer,
  Workflow,
} from 'lucide-react-native';
import * as React from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { EmptyState } from '~/components/empty-state';
import {
  useCancelWorkflowMutation,
  useCiRefresh,
  useRerunWorkflowMutation,
  useWorkflowJobs,
  useWorkflowRun,
} from '~/components/repo/ci/ci-queries';
import { CiStatusIcon } from '~/components/repo/ci/ci-status-icon';
import {
  CI_TONE,
  ciState,
  ciStateLabel,
  isCiActive,
  runDuration,
  workflowFileName,
} from '~/components/repo/ci/ci-types';
import { JobAccordion } from '~/components/repo/ci/job-accordion';
import { DetailHeader } from '~/components/shared/detail-header';
import { useRepoScope } from '~/components/repo/git-queries';
import { GitToast, useGitToast } from '~/components/repo/git-toast';
import { usePrCapabilities } from '~/components/repo/pr/pr-queries';
import { OfflineState, QueryErrorState } from '~/components/repo/repo-states';
import { decodeRouteValue, useRepoRoute } from '~/lib/repo/route';
import { SectionHeader } from '~/components/section-header';
import { relativeTime, shortHash } from '~/components/shared/format';
import { StatusPill } from '~/components/shared/status-pill';
import { SkeletonList } from '~/components/skeleton-list';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

function MetaChip({ icon, label }: { icon: typeof GitBranch; label: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <Icon as={icon} size={10} className="text-muted-foreground/70" />
      <Text numberOfLines={1} className="text-muted-foreground text-2xs">
        {label}
      </Text>
    </View>
  );
}

export default function WorkflowRunDetailScreen() {
  const { hostId, repoPath } = useRepoRoute();
  const params = useLocalSearchParams<{ runId?: string }>();
  const runId = Number.parseInt(decodeRouteValue(params.runId) || '0', 10);
  const scope = useRepoScope(hostId, repoPath);
  const toast = useGitToast();

  const caps = usePrCapabilities(scope);
  const workflowsSupported = caps.data ? caps.data.can_workflows : true;
  const { run, query: runs } = useWorkflowRun(scope, runId, workflowsSupported);
  const jobs = useWorkflowJobs(scope, runId, workflowsSupported);
  const refresh = useCiRefresh(scope);

  const rerun = useRerunWorkflowMutation(scope);
  const cancel = useCancelWorkflowMutation(scope);

  const state = run ? ciState(run.status, run.conclusion) : 'unknown';
  const running = run ? isCiActive(state) : false;
  const duration = run ? runDuration(run) : null;
  const yamlFile = workflowFileName(run?.workflow_path);
  const busy = rerun.isPending || cancel.isPending;

  const doRerun = React.useCallback(() => {
    rerun.mutate(runId, {
      onSuccess: () => toast.showSuccess('Workflow re-run requested'),
      onError: (cause) => toast.showError('Re-run failed', cause),
    });
  }, [rerun, runId, toast]);

  const doCancel = React.useCallback(() => {
    cancel.mutate(runId, {
      onSuccess: () => toast.showSuccess('Cancellation requested'),
      onError: (cause) => toast.showError('Cancel failed', cause),
    });
  }, [cancel, runId, toast]);

  return (
    <View className="bg-background flex-1">
      <DetailHeader
        title={run?.name ?? `Run #${runId || '—'}`}
        subtitle={run ? `#${run.run_number} · ${ciStateLabel(run.status, run.conclusion)}` : repoPath}
        right={
          <>
            {run?.html_url ? (
              <Pressable
                accessibilityLabel="Open run in browser"
                hitSlop={8}
                onPress={() => void Linking.openURL(run.html_url).catch(() => undefined)}
                className="active:bg-accent h-9 w-9 items-center justify-center rounded-lg">
                <Icon as={ExternalLink} size={16} className="text-muted-foreground" />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel="Reload run"
              hitSlop={8}
              onPress={refresh}
              className="active:bg-accent h-9 w-9 items-center justify-center rounded-lg">
              <Icon
                as={RotateCw}
                size={16}
                className={jobs.isFetching ? 'text-git-branch' : 'text-muted-foreground'}
              />
            </Pressable>
          </>
        }
      />

      {!scope.online ? (
        <OfflineState hostId={hostId} />
      ) : !workflowsSupported ? (
        <EmptyState
          icon={Workflow}
          title="Workflow runs are not available"
          description={`${caps.data?.label ?? 'This provider'} does not expose workflow runs.`}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-4 pb-24 pt-3"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={jobs.isRefetching || runs.isRefetching}
              onRefresh={refresh}
              tintColor={palette.mutedForeground}
            />
          }>
          {run ? (
            <Animated.View
              entering={FadeInDown.duration(220).springify().damping(20)}
              className="border-border bg-card/50 gap-3 rounded-2xl border p-4">
              <View className="flex-row items-start gap-3">
                <View className="pt-0.5">
                  <CiStatusIcon status={run.status} conclusion={run.conclusion} size={20} />
                </View>
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="text-foreground text-base font-medium leading-5">
                    {run.name}
                  </Text>
                  {run.display_title ? (
                    <Text numberOfLines={2} className="text-muted-foreground text-xs leading-4">
                      {run.display_title}
                    </Text>
                  ) : null}
                </View>
                <StatusPill
                  label={ciStateLabel(run.status, run.conclusion)}
                  tone={CI_TONE[state]}
                  size="xs"
                  dot
                />
              </View>

              <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5">
                {run.head_branch ? <MetaChip icon={GitBranch} label={run.head_branch} /> : null}
                <Text className="text-muted-foreground/60 font-mono text-2xs">
                  {shortHash(run.head_sha)}
                </Text>
                <Text className="text-muted-foreground/70 text-2xs">{run.event}</Text>
                {run.actor_login ? (
                  <Text className="text-muted-foreground/70 text-2xs">{run.actor_login}</Text>
                ) : null}
                {duration ? <MetaChip icon={Timer} label={duration} /> : null}
                <Text className="text-muted-foreground/60 text-2xs">
                  {relativeTime(run.created_at)}
                </Text>
                {run.run_attempt && run.run_attempt > 1 ? (
                  <StatusPill label={`attempt ${run.run_attempt}`} tone="warning" size="xs" />
                ) : null}
                {yamlFile ? (
                  <StatusPill label={yamlFile} tone="neutral" size="xs" mono />
                ) : null}
              </View>

              <View className="border-border/60 flex-row gap-2 border-t pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={busy}
                  onPress={doRerun}>
                  <Icon as={RotateCw} size={13} className="text-foreground" />
                  <Text className="text-xs">{rerun.isPending ? 'Re-running…' : 'Re-run'}</Text>
                </Button>
                {running ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={busy}
                    onPress={doCancel}>
                    <Icon as={CircleSlash} size={13} className="text-destructive" />
                    <Text className="text-destructive text-xs">
                      {cancel.isPending ? 'Cancelling…' : 'Cancel'}
                    </Text>
                  </Button>
                ) : null}
              </View>
            </Animated.View>
          ) : runs.isPending ? (
            <View className="border-border bg-card/40 gap-3 rounded-2xl border p-4">
              <Skeleton className="h-4 w-2/3 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
              <Skeleton className="h-8 w-full rounded" />
            </View>
          ) : runs.isError ? (
            <QueryErrorState
              title="Could not load the workflow run"
              error={runs.error}
              onRetry={() => void runs.refetch()}
            />
          ) : (
            <EmptyState
              icon={Workflow}
              title="Run not found"
              description={`Workflow run ${runId} is no longer listed for this repository.`}
            />
          )}

          <View>
            <SectionHeader title="Jobs" count={jobs.data?.length} />
            {jobs.isPending ? (
              <SkeletonList rows={4} />
            ) : jobs.isError ? (
              <QueryErrorState
                title="Could not load jobs"
                error={jobs.error}
                onRetry={() => void jobs.refetch()}
              />
            ) : (jobs.data?.length ?? 0) === 0 ? (
              <View className="border-border bg-card/40 rounded-xl border px-3 py-3">
                <Text className="text-muted-foreground text-xs">
                  This run reported no jobs yet.
                </Text>
              </View>
            ) : (
              <JobAccordion jobs={jobs.data ?? []} />
            )}
          </View>
        </ScrollView>
      )}

      <GitToast notice={toast.notice} onDismiss={toast.dismiss} />
    </View>
  );
}
