import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, GitMerge, RotateCw, Trash2, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { Alert, FlatList, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from 'zustand';

import { ReviewFinishSheet } from '~/components/agents/review/finish-sheet';
import { ReviewBranchBar, ReviewFileRow, ReviewStats } from '~/components/agents/review/review-ui';
import { EmptyState } from '~/components/empty-state';
import { QueryErrorState } from '~/components/repo/repo-states';
import { useBottomInset } from '~/components/shared/use-bottom-inset';
import { SkeletonList } from '~/components/skeleton-list';
import { GlassCircle, SolidPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { pushAgentNotice } from '~/lib/agents/attention';
import {
  agentReviewFileHref,
  discardReviewFileWithPreview,
  reviewDiscardPreviewMessage,
  useAgentReviewSession,
  useAgentSessionBusy,
  useHostLabel,
  useReviewFinish,
  useReviewSummary,
  type AgentReviewFile,
} from '~/lib/agents/review';
import { useHostRuntime } from '~/lib/connections';
import { decodeRouteValue } from '~/lib/repo/route';
import { useAgentConnection } from '~/lib/agents/use-agent-connection';
import { mobileFinishAvailable } from '~/lib/agents/review-finish';
import { EMPTY_REVIEW_MARKS, reviewProgressContextKey, reviewProgressStore, subscribeReviewProgressCache } from '~/lib/agents/review-progress';

export default function AgentReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hostId?: string; path?: string }>();
  const hostId = decodeRouteValue(params.hostId);
  const worktreePath = decodeRouteValue(params.path);
  const hostName = useHostLabel(hostId);
  const runtime = useHostRuntime(hostId);
  const online = runtime.status === 'online';
  const connection = useAgentConnection(hostId);
  const focused = React.useRef(true);
  useFocusEffect(React.useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
  const bottom = useBottomInset();

  const { session, recoveryContext, live, loading: resolving, error: resolveError, refetch } = useAgentReviewSession(
    hostId,
    worktreePath
  );
  const summaryQuery = useReviewSummary(session, live);
  const summary = summaryQuery.data ?? null;
  const queryClient = useQueryClient();
  const busy = useAgentSessionBusy(hostId, worktreePath);
  const finishAvailable = mobileFinishAvailable(online, connection);
  const finish = useReviewFinish(session, live ? summary : null, {
    hostId, worktreePath,
    recoveryContext, available: finishAvailable, isActive: () => focused.current,
  });

  const progressContext = React.useMemo(() => session && summary ? {
    hostId: session.hostId, worktreePath: session.worktreePath, mergeBase: summary.mergeBase,
  } : null, [session?.hostId, session?.worktreePath, summary?.mergeBase]);
  const marks = useStore(reviewProgressStore, (state) => progressContext && state.context &&
    reviewProgressContextKey(state.context) === reviewProgressContextKey(progressContext) ? state.marks : EMPTY_REVIEW_MARKS);
  useFocusEffect(React.useCallback(() => {
    if (progressContext) reviewProgressStore.getState().begin(progressContext, summaryQuery.dataUpdatedAt);
  }, [progressContext, summaryQuery.dataUpdatedAt]));
  React.useEffect(() => progressContext ?
    subscribeReviewProgressCache(queryClient.getQueryCache(), progressContext) : undefined,
  [progressContext, queryClient]);
  React.useEffect(() => {
    if (progressContext && (busy || !online || finish.worktreeRemoved)) {
      reviewProgressStore.getState().invalidate(progressContext);
    }
  }, [progressContext, busy, online, finish.worktreeRemoved]);
  const [finishOpen, setFinishOpen] = React.useState(false);
  const [discardPhase, setDiscardPhase] = React.useState<
    'preview' | 'confirm' | 'discard' | null
  >(null);
  const pendingDiscard = React.useRef<object | null>(null);
  const mounted = React.useRef(true);
  const reviewScope = JSON.stringify([
    hostId,
    worktreePath,
    session?.hostId,
    session?.worktreePath,
    session?.basePath,
    summary?.mergeBase,
    summary?.sessionBranch,
  ]);
  const currentReview = React.useRef({
    scope: reviewScope,
    blocked: busy || !online || finish.worktreeRemoved,
  });
  currentReview.current = { scope: reviewScope, blocked: busy || !online || finish.worktreeRemoved };

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingDiscard.current = null;
    };
  }, []);

  React.useEffect(() => {
    pendingDiscard.current = null;
    setDiscardPhase(null);
    if (progressContext) reviewProgressStore.getState().invalidate(progressContext);
  }, [reviewScope]);

  const files = finish.worktreeRemoved ? [] : summary?.files ?? [];

  const openFile = React.useCallback(
    (file: AgentReviewFile) => {
      if (!session || !summary || finish.worktreeRemoved || pendingDiscard.current) {
        return;
      }
      router.push(
        agentReviewFileHref(
          session.hostId,
          session.worktreePath,
          summary.mergeBase,
          file.path
        )
      );
    },
    [router, session, summary, finish.worktreeRemoved]
  );

  const confirmDiscard = React.useCallback(
    (file: AgentReviewFile) => {
      if (!session || !summary || busy || !online || finish.worktreeRemoved || pendingDiscard.current) {
        return;
      }
      const operation = {};
      const scope = reviewScope;
      pendingDiscard.current = operation;
      setDiscardPhase('preview');
      const inScope = () =>
        mounted.current &&
        pendingDiscard.current === operation &&
        currentReview.current.scope === scope;
      const canProceed = () => inScope() && !currentReview.current.blocked;
      void (async () => {
        try {
          const discarded = await discardReviewFileWithPreview(
            session,
            summary.mergeBase,
            file,
            (preview) => {
              setDiscardPhase('confirm');
              return new Promise<boolean>((resolve) => {
                Alert.alert(
                  'Discard file',
                  reviewDiscardPreviewMessage(preview),
                  [
                    {
                      text: 'Cancel',
                      style: 'cancel',
                      onPress: () => resolve(false),
                    },
                    {
                      text: 'Discard',
                      style: 'destructive',
                      onPress: () => {
                        if (canProceed()) setDiscardPhase('discard');
                        resolve(true);
                      },
                    },
                  ],
                  { cancelable: true, onDismiss: () => resolve(false) }
                );
              });
            },
            canProceed
          );
          if (discarded && inScope()) {
            if (progressContext) reviewProgressStore.getState().invalidate(progressContext);
            await summaryQuery.refetch();
          } else if (inScope() && currentReview.current.blocked) {
            pushAgentNotice(
              'The review is unavailable right now. Reconnect or wait for the agent turn to finish, then review the file again.',
              { tone: 'attention' }
            );
            await summaryQuery.refetch();
          }
        } catch (cause) {
          if (!inScope()) return;
          const message =
            cause instanceof Error ? cause.message : String(cause);
          pushAgentNotice(
            message.includes('__FILE_CHANGED__')
              ? 'The file changed after its preview. Review the refreshed changes before discarding again.'
              : message,
            { tone: 'attention' }
          );
          await summaryQuery.refetch();
        } finally {
          if (pendingDiscard.current === operation) {
            pendingDiscard.current = null;
            if (mounted.current) setDiscardPhase(null);
          }
        }
      })();
    },
    [busy, online, reviewScope, session, summary, summaryQuery, finish.worktreeRemoved, progressContext]
  );

  const locked = busy || discardPhase !== null || !online || finish.status === 'running';

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        <GlassCircle
          icon={ArrowLeft}
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/agents/reviews'))}
        />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-foreground text-3xl font-bold tracking-tight">
            Review
          </Text>
          <Text numberOfLines={1} className="text-muted-foreground text-sm">
            {`${worktreePath.split('/').pop() ?? worktreePath} · ${hostName}`}
          </Text>
        </View>
        <GlassCircle
          icon={RotateCw}
          label="Refresh review"
          onPress={() => {
            void refetch();
            if (live && !finish.worktreeRemoved) void summaryQuery.refetch();
            finish.refresh();
          }}
        />
      </View>

      <View className="bg-card mx-5 mb-3 gap-2.5 rounded-[28px] px-4 py-4">
        <ReviewBranchBar summary={summary ?? finish.summary} branch={session?.branch ?? null} />
        <ReviewStats summary={summary ?? finish.summary} />
        {files.length > 0 ? <Text className="text-muted-foreground text-2xs">
          {files.filter(file => typeof marks[file.path] === 'string').length} of {files.length} files marked reviewed
        </Text> : null}
      </View>

      {busy ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          className="bg-warning/12 mx-5 mb-3 flex-row items-start gap-2.5 rounded-2xl px-4 py-3">
          <Icon as={TriangleAlert} size={13} className="text-warning mt-px" />
          <Text className="text-warning flex-1 text-2xs leading-4">
            An agent turn is still running in this worktree — the diff can change while you review.
          </Text>
        </Animated.View>
      ) : null}

      {!online ? (
        <EmptyState
          icon={TriangleAlert}
          title="Host offline"
          description={`${hostName} is not connected — reconnect it to review this worktree.`}
        />
      ) : resolveError ? (
        <View className="px-5">
          <QueryErrorState
            title="Could not resolve the worktree"
            error={resolveError}
            onRetry={() => void refetch()}
          />
        </View>
      ) : summaryQuery.error && live && !finish.worktreeRemoved ? (
        <View className="px-5">
          <QueryErrorState
            title="Could not load the review summary"
            error={summaryQuery.error}
            onRetry={() => void summaryQuery.refetch()}
          />
        </View>
      ) : resolving || live && summaryQuery.isPending ? (
        <View className="px-5 pt-1">
          <SkeletonList rows={6} />
        </View>
      ) : !session ? (
        <EmptyState
          icon={TriangleAlert}
          title="Not a worktree"
          description="This path is the main working tree — agent reviews only apply to session worktrees."
        />
      ) : finish.worktreeRemoved ? (
        <EmptyState
          icon={GitMerge}
          title="Worktree removed"
          description={finish.branchDeleted ? 'The session branch has been removed.' : 'Resume finishing to remove the remaining session branch.'}
        />
      ) : files.length === 0 ? (
        <EmptyState
          icon={GitMerge}
          title="No changes"
          description="The session branch matches its base — there is nothing to review."
        />
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => item.path}
          contentContainerStyle={{ paddingBottom: bottom + 96 }}
          contentContainerClassName="px-5"
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <ReviewFileRow
              file={item}
              first={index === 0}
              last={index === files.length - 1}
              reviewed={typeof marks[item.path] === 'string'}
              onPress={() => openFile(item)}
              onLongPress={() => confirmDiscard(item)}
            />
          )}
        />
      )}

      {session && (summary || recoveryContext) ? (
        <View
          pointerEvents="box-none"
          style={{ paddingBottom: bottom + 8 }}
          className="absolute bottom-0 left-0 right-0 flex-row gap-2.5 px-5 pt-3">
          <SolidPill
            icon={GitMerge}
            label={finish.worktreeRemoved ? 'Resume cleanup' : 'Finish'}
            disabled={locked}
            onPress={() => setFinishOpen(true)}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}

      {discardPhase === 'preview' || discardPhase === 'discard' ? (
        <View className="bg-background/70 absolute bottom-0 left-0 right-0 top-0 items-center justify-center">
          <View className="bg-card flex-row items-center gap-2.5 rounded-full px-5 py-3.5">
            <Icon as={Trash2} size={15} className="text-destructive" />
            <Text className="text-foreground text-sm font-medium">
              {discardPhase === 'preview' ? 'Loading preview…' : 'Discarding…'}
            </Text>
          </View>
        </View>
      ) : null}

      <ReviewFinishSheet
        visible={finishOpen}
        onClose={() => setFinishOpen(false)}
        finish={finish}
        busy={busy}
        online={online}
        available={finishAvailable}
        onFinished={() => {
          setFinishOpen(false);
          pushAgentNotice('Session landed into its base branch', { tone: 'success' });
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/agents/reviews');
          }
        }}
      />
    </SafeAreaView>
  );
}
