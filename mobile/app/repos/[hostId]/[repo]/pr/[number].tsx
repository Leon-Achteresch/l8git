import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Ellipsis, ExternalLink, RotateCw } from 'lucide-react-native';
import * as React from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ChecksList, ChecksSummary, canRerunCheck } from '~/components/repo/ci/checks-section';
import type { RemoteCiCheck } from '~/components/repo/ci/ci-types';
import { useRepoScope } from '~/components/repo/git-queries';
import { errorMessage } from '~/components/repo/git-types';
import { GitToast, useGitToast } from '~/components/repo/git-toast';
import { BranchRoute } from '~/components/repo/pr/branch-route';
import { PrActionSheet } from '~/components/repo/pr/pr-action-sheet';
import { PrComposer } from '~/components/repo/pr/pr-composer';
import { PR_STATE_LABEL, PR_STATE_TONE, PrGlyph } from '~/components/repo/pr/pr-glyph';
import {
  useBranchProtection,
  usePrCapabilities,
  usePrChecks,
  usePrCommentMutation,
  usePrConversation,
  usePrDetail,
  usePrRefresh,
  usePrRerunCheckMutation,
} from '~/components/repo/pr/pr-queries';
import { PrStatusBanner } from '~/components/repo/pr/pr-status-banner';
import { PrTimeline, buildTimeline } from '~/components/repo/pr/pr-timeline';
import {
  isPrActive,
  prDisplayState,
  providerUnknownHost,
} from '~/components/repo/pr/pr-types';
import { OfflineState, QueryErrorState } from '~/components/repo/repo-states';
import { decodeRouteValue, useRepoRoute } from '~/lib/repo/route';
import { SectionHeader } from '~/components/section-header';
import { accentFor, initials, relativeTime } from '~/components/shared/format';
import { MarkdownView } from '~/components/shared/markdown-view';
import { StatusPill } from '~/components/shared/status-pill';
import { SkeletonList } from '~/components/skeleton-list';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { GlassCircle, GlassPill, SolidPill } from '~/components/ui/glass';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

export default function PullRequestDetailScreen() {
  const router = useRouter();
  const { hostId, repoPath } = useRepoRoute();
  const params = useLocalSearchParams<{ number?: string }>();
  const number = Number.parseInt(decodeRouteValue(params.number) || '0', 10);
  const scope = useRepoScope(hostId, repoPath);
  const toast = useGitToast();

  const caps = usePrCapabilities(scope);
  const detail = usePrDetail(scope, number);
  const conversation = usePrConversation(scope, number);
  const checks = usePrChecks(scope, number);
  const refresh = usePrRefresh(scope, number);

  const active = detail.data ? isPrActive(detail.data) : false;
  const protection = useBranchProtection(scope, detail.data?.target_branch ?? null, active);

  const comment = usePrCommentMutation(scope);
  const rerun = usePrRerunCheckMutation(scope);

  const [body, setBody] = React.useState('');
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const [rerunningKey, setRerunningKey] = React.useState<string | null>(null);

  const entries = React.useMemo(() => buildTimeline(conversation.data), [conversation.data]);
  const state = detail.data ? prDisplayState(detail.data) : 'open';
  const tint = accentFor(detail.data?.author ?? String(number));

  const sendComment = React.useCallback(() => {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      return;
    }
    comment.mutate(
      { number, body: trimmed },
      {
        onSuccess: () => {
          setBody('');
          toast.showSuccess('Comment posted');
        },
        onError: (cause) => toast.showError('Could not post the comment', cause),
      }
    );
  }, [body, comment, number, toast]);

  const rerunCheck = React.useCallback(
    (check: RemoteCiCheck) => {
      setRerunningKey(check.check_run_id ?? check.name);
      rerun.mutate(
        { checkRunId: check.check_run_id ?? null, suiteId: check.check_suite_id ?? null },
        {
          onSuccess: () => toast.showSuccess(`Re-running ${check.name}`),
          onError: (cause) => toast.showError('Re-run failed', cause),
          onSettled: () => setRerunningKey(null),
        }
      );
    },
    [rerun, toast]
  );

  const canRerunChecks = Boolean(caps.data?.can_rerun_checks);
  const rerunnableChecks = (checks.data ?? []).some(canRerunCheck);
  const unknownHost = detail.isError ? providerUnknownHost(errorMessage(detail.error)) : null;

  const goBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/repos');
  }, [router]);

  const openActions = React.useCallback(() => setActionsOpen(true), []);
  const htmlUrl = detail.data?.html_url ?? null;
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
            {detail.data ? `#${detail.data.number} · ${detail.data.author}` : `#${number || '—'}`}
          </Text>
          <Text numberOfLines={1} className="text-foreground text-lg font-bold tracking-tight">
            {detail.data?.title ?? 'Pull request'}
          </Text>
          {detail.data ? (
            <BranchRoute
              head={detail.data.source_branch}
              base={detail.data.target_branch}
              max={18}
            />
          ) : (
            <Text numberOfLines={1} className="text-muted-foreground text-2xs">
              {repoPath}
            </Text>
          )}
        </View>
        <GlassCircle
          icon={RotateCw}
          label="Reload pull request"
          size={40}
          color={detail.isFetching ? palette.foreground : palette.mutedForeground}
          onPress={refresh}
        />
        <GlassCircle
          icon={Ellipsis}
          label="Pull request actions"
          size={40}
          onPress={detail.data ? openActions : undefined}
        />
      </View>

      {!scope.online ? (
        <OfflineState hostId={hostId} />
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={90}>
          <ScrollView
            contentContainerClassName="gap-3 px-5 pb-28 pt-1"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {detail.isPending ? (
              <View className="gap-3">
                <View className="bg-card gap-3 rounded-[28px] p-4">
                  <Skeleton className="h-4 w-3/4 rounded-full" />
                  <Skeleton className="h-3 w-1/2 rounded-full" />
                  <Skeleton className="h-3 w-2/5 rounded-full" />
                </View>
                <SkeletonList rows={4} avatar />
              </View>
            ) : detail.isError ? (
              <QueryErrorState
                title={
                  unknownHost
                    ? `No provider configured for ${unknownHost}`
                    : 'Could not load the pull request'
                }
                error={detail.error}
                onRetry={() => void detail.refetch()}
              />
            ) : detail.data ? (
              <>
                <Animated.View
                  entering={FadeInDown.duration(220).springify().damping(20)}
                  className="bg-card gap-3 rounded-[28px] p-4">
                  <View className="flex-row items-start gap-3">
                    <PrGlyph state={state} />
                    <View className="min-w-0 flex-1 gap-1">
                      <Text className="text-foreground text-base font-semibold leading-5">
                        {detail.data.title}
                      </Text>
                      <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
                        <Text className="text-muted-foreground text-2xs">
                          opened {relativeTime(detail.data.created_at)}
                        </Text>
                        <Text className="text-muted-foreground/40 text-2xs">·</Text>
                        <Text className="text-muted-foreground text-2xs">
                          updated {relativeTime(detail.data.updated_at)}
                        </Text>
                      </View>
                    </View>
                    <StatusPill
                      label={PR_STATE_LABEL[state]}
                      tone={PR_STATE_TONE[state]}
                      size="xs"
                      dot
                    />
                  </View>

                  <View className="flex-row items-center gap-2">
                    <Avatar alt={detail.data.author} className="size-7">
                      <AvatarFallback style={{ backgroundColor: `${tint}26` }}>
                        <Text style={{ color: tint }} className="text-2xs font-semibold">
                          {initials(detail.data.author)}
                        </Text>
                      </AvatarFallback>
                    </Avatar>
                    <Text numberOfLines={1} className="text-foreground text-xs font-medium">
                      {detail.data.author}
                    </Text>
                    <View className="bg-white/10 h-3 w-px" />
                    <BranchRoute
                      head={detail.data.source_branch}
                      base={detail.data.target_branch}
                      max={18}
                      className="flex-1"
                    />
                  </View>

                  {detail.data.labels.length > 0 ? (
                    <View className="flex-row flex-wrap gap-1">
                      {detail.data.labels.map((label) => (
                        <StatusPill key={label} label={label} tone="accent" size="xs" />
                      ))}
                    </View>
                  ) : null}

                  {detail.data.reviewers.length > 0 ? (
                    <View className="border-white/5 flex-row flex-wrap items-center gap-1.5 border-t pt-3">
                      <Text className="text-muted-foreground text-2xs uppercase tracking-widest">
                        Reviewers
                      </Text>
                      {detail.data.reviewers.map((reviewer) => (
                        <StatusPill
                          key={reviewer.login}
                          label={reviewer.login}
                          tone="neutral"
                          size="xs"
                        />
                      ))}
                    </View>
                  ) : null}
                </Animated.View>

                <PrStatusBanner detail={detail.data} protection={protection.data ?? null} />

                <View className="flex-row items-center gap-2 pt-1">
                  <SolidPill
                    icon={Ellipsis}
                    label="Actions"
                    onPress={openActions}
                    style={{ flex: 1 }}
                  />
                  {detail.data.html_url ? (
                    <GlassPill icon={ExternalLink} label="Open on web" onPress={openOnWeb} />
                  ) : null}
                </View>

                {detail.data.body_markdown.trim().length > 0 ? (
                  <View className="bg-card rounded-[28px] px-4 py-4">
                    <MarkdownView content={detail.data.body_markdown} />
                  </View>
                ) : (
                  <View className="bg-card rounded-[28px] px-4 py-4">
                    <Text className="text-muted-foreground text-xs italic">
                      No description provided.
                    </Text>
                  </View>
                )}

                <View>
                  <SectionHeader title="Checks" count={checks.data?.length} />
                  {checks.isPending ? (
                    <SkeletonList rows={3} />
                  ) : checks.isError ? (
                    <QueryErrorState
                      title="Could not load checks"
                      error={checks.error}
                      onRetry={() => void checks.refetch()}
                    />
                  ) : (
                    <View className="gap-3">
                      <ChecksSummary checks={checks.data ?? []} />
                      <ChecksList
                        checks={checks.data ?? []}
                        rerunningKey={rerunningKey}
                        onRerun={canRerunChecks ? rerunCheck : null}
                      />
                      {!canRerunChecks && rerunnableChecks ? (
                        <Text className="text-muted-foreground px-1 text-2xs">
                          {caps.data?.label ?? 'This provider'} does not support re-running checks
                          from l8git.
                        </Text>
                      ) : null}
                    </View>
                  )}
                </View>

                <View>
                  <SectionHeader title="Conversation" count={entries.length} />
                  {conversation.isPending ? (
                    <SkeletonList rows={3} avatar />
                  ) : conversation.isError ? (
                    <QueryErrorState
                      title="Could not load the conversation"
                      error={conversation.error}
                      onRetry={() => void conversation.refetch()}
                    />
                  ) : (
                    <PrTimeline entries={entries} />
                  )}
                </View>

                <PrComposer
                  value={body}
                  onChangeText={setBody}
                  onSubmit={sendComment}
                  sending={comment.isPending}
                />
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <PrActionSheet
        scope={scope}
        detail={detail.data ?? null}
        caps={caps.data ?? null}
        visible={actionsOpen}
        toast={toast}
        onClose={() => setActionsOpen(false)}
      />
      <GitToast notice={toast.notice} onDismiss={toast.dismiss} />
    </View>
  );
}
