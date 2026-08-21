import { useLocalSearchParams } from 'expo-router';
import { MoreVertical, RotateCw } from 'lucide-react-native';
import * as React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ChecksList, ChecksSummary, canRerunCheck } from '~/components/repo/ci/checks-section';
import type { RemoteCiCheck } from '~/components/repo/ci/ci-types';
import { DetailHeader } from '~/components/shared/detail-header';
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
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';

export default function PullRequestDetailScreen() {
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

  return (
    <View className="bg-background flex-1">
      <DetailHeader
        title={detail.data?.title ?? `Pull request #${number || '—'}`}
        subtitle={detail.data ? `#${detail.data.number} · ${detail.data.author}` : repoPath}
        right={
          <>
            <Pressable
              accessibilityLabel="Reload pull request"
              hitSlop={8}
              onPress={refresh}
              className="active:bg-accent h-9 w-9 items-center justify-center rounded-lg">
              <Icon
                as={RotateCw}
                size={16}
                className={detail.isFetching ? 'text-foreground' : 'text-muted-foreground'}
              />
            </Pressable>
            <Pressable
              accessibilityLabel="Pull request actions"
              hitSlop={8}
              disabled={!detail.data}
              onPress={() => setActionsOpen(true)}
              className="active:bg-accent h-9 w-9 items-center justify-center rounded-lg">
              <Icon as={MoreVertical} size={17} className="text-foreground" />
            </Pressable>
          </>
        }
      />

      {!scope.online ? (
        <OfflineState hostId={hostId} />
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={90}>
          <ScrollView
            contentContainerClassName="gap-3 px-4 pb-24 pt-3"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {detail.isPending ? (
              <View className="gap-3">
                <View className="border-border bg-card/40 gap-3 rounded-2xl border p-4">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                  <Skeleton className="h-3 w-2/5 rounded" />
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
                  className="border-border bg-card/50 gap-3 rounded-2xl border p-4">
                  <View className="flex-row items-start gap-3">
                    <PrGlyph state={state} />
                    <View className="min-w-0 flex-1 gap-1">
                      <Text className="text-foreground text-base font-medium leading-5">
                        {detail.data.title}
                      </Text>
                      <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
                        <Text className="text-muted-foreground/70 font-mono text-2xs">
                          #{detail.data.number}
                        </Text>
                        <Text className="text-muted-foreground/40 text-2xs">·</Text>
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
                    <Avatar alt={detail.data.author} className="size-6">
                      <AvatarFallback style={{ backgroundColor: `${tint}26` }}>
                        <Text style={{ color: tint }} className="text-2xs font-semibold">
                          {initials(detail.data.author)}
                        </Text>
                      </AvatarFallback>
                    </Avatar>
                    <Text numberOfLines={1} className="text-muted-foreground text-xs">
                      {detail.data.author}
                    </Text>
                    <View className="bg-border h-3 w-px" />
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
                    <View className="border-border/60 flex-row flex-wrap items-center gap-1.5 border-t pt-3">
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

                {detail.data.body_markdown.trim().length > 0 ? (
                  <View className="border-border bg-card/40 rounded-xl border p-3.5">
                    <MarkdownView content={detail.data.body_markdown} />
                  </View>
                ) : (
                  <View className="border-border bg-card/40 rounded-xl border p-3.5">
                    <Text className="text-muted-foreground/70 text-xs italic">
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
                    <View className="gap-2">
                      <ChecksSummary checks={checks.data ?? []} />
                      <ChecksList
                        checks={checks.data ?? []}
                        rerunningKey={rerunningKey}
                        onRerun={canRerunChecks ? rerunCheck : null}
                      />
                      {!canRerunChecks && rerunnableChecks ? (
                        <Text className="text-muted-foreground/60 px-0.5 text-2xs">
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
