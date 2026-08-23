import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  CircleSlash,
  ExternalLink,
  GitBranch,
  RotateCw,
  Timer,
  Workflow,
} from 'lucide-react-native';
import * as React from 'react';
import { Linking, RefreshControl, ScrollView, View } from 'react-native';
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
  type CiState,
} from '~/components/repo/ci/ci-types';
import { JobAccordion } from '~/components/repo/ci/job-accordion';
import { useRepoScope } from '~/components/repo/git-queries';
import { GitToast, useGitToast } from '~/components/repo/git-toast';
import { usePrCapabilities } from '~/components/repo/pr/pr-queries';
import { OfflineState, QueryErrorState } from '~/components/repo/repo-states';
import { decodeRouteValue, useRepoRoute } from '~/lib/repo/route';
import { SectionHeader } from '~/components/section-header';
import { relativeTime, shortHash } from '~/components/shared/format';
import { StatusPill } from '~/components/shared/status-pill';
import { SkeletonList } from '~/components/skeleton-list';
import { GlassCircle, GlassPill, SolidPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

const RUN_SURFACE: Record<CiState, string> = {
  success: 'bg-git-added/15',
  failure: 'bg-git-removed/15',
  running: 'bg-git-branch/15',
  queued: 'bg-git-modified/15',
  cancelled: 'bg-white/10',
  skipped: 'bg-white/10',
  neutral: 'bg-white/10',
  unknown: 'bg-white/10',
};

function MetaChip({ icon, label }: { icon: typeof GitBranch; label: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <Icon as={icon} size={10} className="text-muted-foreground" />
      <Text numberOfLines={1} className="text-muted-foreground text-2xs">
        {label}
      </Text>
    </View>
  );
}

export default function WorkflowRunDetailScreen() {
  const router = useRouter();
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

  const goBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/repos');
  }, [router]);

  const htmlUrl = run?.html_url ?? null;
  const openOnWeb = React.useCallback(() => {
    if (htmlUrl) {
      void Linking.openURL(htmlUrl).catch(() => undefined);
    }
  }, [htmlUrl]);

  return (
    <View className="bg-background flex-1">
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        <GlassCircle icon={ArrowLeft} label="Back" onPress={goBack} />
        <View className="min-w-0 flex-1">
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-muted-foreground text-xs font-medium">
            {run
              ? `#${run.run_number} · ${ciStateLabel(run.status, run.conclusion)}`
              : `#${runId || '—'}`}
          </Text>
          <Text numberOfLines={1} className="text-foreground text-lg font-bold tracking-tight">
            {run?.name ?? 'Workflow run'}
          </Text>
          <View className="flex-row items-center gap-1">
            <Icon as={GitBranch} size={10} className="text-muted-foreground" />
            <Text numberOfLines={1} className="text-muted-foreground text-2xs">
              {run?.head_branch || repoPath}
            </Text>
          </View>
        </View>
        {htmlUrl ? (
          <GlassCircle
            icon={ExternalLink}
            label="Open run in browser"
            size={40}
            onPress={openOnWeb}
          />
        ) : null}
        <GlassCircle
          icon={RotateCw}
          label="Reload run"
          size={40}
          color={jobs.isFetching ? palette.foreground : palette.mutedForeground}
          onPress={refresh}
        />
      </View>

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
          contentContainerClassName="gap-3 px-5 pb-28 pt-1"
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
              className="bg-card gap-3 rounded-[28px] p-4">
              <View className="flex-row items-start gap-3">
                <View
                  className={cn(
                    'h-11 w-11 items-center justify-center rounded-full',
                    RUN_SURFACE[state]
                  )}>
                  <CiStatusIcon status={run.status} conclusion={run.conclusion} size={19} />
                </View>
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="text-foreground text-base font-semibold leading-5">
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
                <Text className="text-muted-foreground font-mono text-2xs">
                  {shortHash(run.head_sha)}
                </Text>
                <Text className="text-muted-foreground text-2xs">{run.event}</Text>
                {run.actor_login ? (
                  <Text className="text-muted-foreground text-2xs">{run.actor_login}</Text>
                ) : null}
                {duration ? <MetaChip icon={Timer} label={duration} /> : null}
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-muted-foreground text-2xs">
                  {relativeTime(run.created_at)}
                </Text>
                {run.run_attempt && run.run_attempt > 1 ? (
                  <StatusPill label={`attempt ${run.run_attempt}`} tone="warning" size="xs" />
                ) : null}
                {yamlFile ? (
                  <StatusPill label={yamlFile} tone="neutral" size="xs" mono />
                ) : null}
              </View>

              <View className="border-white/5 flex-row items-center gap-2 border-t pt-3">
                <SolidPill
                  icon={RotateCw}
                  label={rerun.isPending ? 'Re-running…' : 'Re-run'}
                  disabled={busy}
                  onPress={doRerun}
                  style={{ flex: 1 }}
                />
                {running ? (
                  <GlassPill
                    icon={CircleSlash}
                    label={cancel.isPending ? 'Cancelling…' : 'Cancel'}
                    onPress={busy ? undefined : doCancel}
                    style={{ opacity: busy ? 0.5 : 1 }}
                  />
                ) : null}
              </View>
            </Animated.View>
          ) : runs.isPending ? (
            <View className="bg-card gap-3 rounded-[28px] p-4">
              <Skeleton className="h-4 w-2/3 rounded-full" />
              <Skeleton className="h-3 w-1/2 rounded-full" />
              <Skeleton className="h-10 w-full rounded-full" />
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
              <View className="bg-card rounded-[28px] px-4 py-3.5">
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
