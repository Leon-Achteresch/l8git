import { useLocalSearchParams, useRouter } from 'expo-router';
import { GitMerge, RotateCw, Trash2, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { Alert, FlatList, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReviewFinishSheet } from '~/components/agents/review/finish-sheet';
import { ReviewBranchBar, ReviewFileRow, ReviewStats } from '~/components/agents/review/review-ui';
import { EmptyState } from '~/components/empty-state';
import { QueryErrorState } from '~/components/repo/repo-states';
import { DetailHeader } from '~/components/shared/detail-header';
import { useBottomInset } from '~/components/shared/use-bottom-inset';
import { SkeletonList } from '~/components/skeleton-list';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { pushAgentNotice } from '~/lib/agents/attention';
import {
  agentReviewFileHref,
  discardReviewFile,
  useAgentReviewSession,
  useAgentSessionBusy,
  useHostLabel,
  useReviewFinish,
  useReviewSummary,
  type AgentReviewFile,
} from '~/lib/agents/review';
import { useHostRuntime } from '~/lib/connections';
import { decodeRouteValue } from '~/lib/repo/route';

export default function AgentReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hostId?: string; path?: string }>();
  const hostId = decodeRouteValue(params.hostId);
  const worktreePath = decodeRouteValue(params.path);
  const hostName = useHostLabel(hostId);
  const runtime = useHostRuntime(hostId);
  const online = runtime.status === 'online';
  const bottom = useBottomInset();

  const { session, loading: resolving, error: resolveError, refetch } = useAgentReviewSession(
    hostId,
    worktreePath
  );
  const summaryQuery = useReviewSummary(session);
  const summary = summaryQuery.data ?? null;
  const busy = useAgentSessionBusy(worktreePath);
  const finish = useReviewFinish(session, summary);

  const [reviewed, setReviewed] = React.useState<ReadonlySet<string>>(new Set());
  const [finishOpen, setFinishOpen] = React.useState(false);
  const [discarding, setDiscarding] = React.useState(false);

  const files = summary?.files ?? [];

  const toggleReviewed = React.useCallback((path: string) => {
    setReviewed((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const openFile = React.useCallback(
    (file: AgentReviewFile) => {
      if (!session || !summary) {
        return;
      }
      setReviewed((current) => new Set(current).add(file.path));
      router.push(
        agentReviewFileHref(session.hostId, session.worktreePath, summary.mergeBase, file.path)
      );
    },
    [router, session, summary]
  );

  const confirmDiscard = React.useCallback(
    (file: AgentReviewFile) => {
      if (!session || !summary) {
        return;
      }
      Alert.alert('Discard file', `Revert ${file.path} to the merge base?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setDiscarding(true);
            void discardReviewFile(session, summary.mergeBase, file)
              .then(() => summaryQuery.refetch())
              .catch((cause: unknown) =>
                pushAgentNotice(cause instanceof Error ? cause.message : String(cause), {
                  tone: 'attention',
                })
              )
              .finally(() => setDiscarding(false));
          },
        },
      ]);
    },
    [session, summary, summaryQuery]
  );

  const locked = busy || discarding || !online;

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <DetailHeader
        title="Review session"
        subtitle={`${worktreePath.split('/').pop() ?? worktreePath} · ${hostName}`}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/agents/reviews'))}
        right={
          <Button
            size="icon"
            variant="ghost"
            accessibilityLabel="Refresh review"
            onPress={() => {
              void refetch();
              void summaryQuery.refetch();
            }}>
            <Icon as={RotateCw} size={16} className="text-muted-foreground" />
          </Button>
        }
      />

      <View className="gap-2 px-4 pb-2 pt-3">
        <ReviewBranchBar summary={summary} branch={session?.branch ?? null} />
        <ReviewStats summary={summary} />
      </View>

      {busy ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          className="border-git-modified/30 bg-git-modified/10 mx-4 mb-2 flex-row items-start gap-2 rounded-xl border px-3 py-2">
          <Icon as={TriangleAlert} size={12} className="text-git-modified" />
          <Text className="text-muted-foreground flex-1 text-2xs leading-4">
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
        <View className="px-4">
          <QueryErrorState
            title="Could not resolve the worktree"
            error={resolveError}
            onRetry={() => void refetch()}
          />
        </View>
      ) : summaryQuery.error ? (
        <View className="px-4">
          <QueryErrorState
            title="Could not load the review summary"
            error={summaryQuery.error}
            onRetry={() => void summaryQuery.refetch()}
          />
        </View>
      ) : resolving || summaryQuery.isPending ? (
        <View className="px-4 pt-1">
          <SkeletonList rows={6} />
        </View>
      ) : !session ? (
        <EmptyState
          icon={TriangleAlert}
          title="Not a worktree"
          description="This path is the main working tree — agent reviews only apply to session worktrees."
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
          contentContainerStyle={{ paddingBottom: bottom + 84 }}
          contentContainerClassName="px-4"
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <ReviewFileRow
              file={item}
              first={index === 0}
              last={index === files.length - 1}
              reviewed={reviewed.has(item.path)}
              onPress={() => openFile(item)}
              onLongPress={() => confirmDiscard(item)}
            />
          )}
        />
      )}

      {session && summary && files.length > 0 ? (
        <View
          style={{ paddingBottom: bottom + 8 }}
          className="border-border/60 bg-background absolute bottom-0 left-0 right-0 flex-row gap-2 border-t px-4 pt-2.5">
          <Button
            variant="outline"
            className="flex-1"
            disabled={locked}
            onPress={() => setReviewed(new Set(files.map((file) => file.path)))}>
            <Text className="text-xs">Mark all reviewed</Text>
          </Button>
          <Button className="flex-1" disabled={locked} onPress={() => setFinishOpen(true)}>
            <Icon as={GitMerge} size={14} className="text-primary-foreground" />
            <Text className="text-xs">Finish</Text>
          </Button>
        </View>
      ) : null}

      {discarding ? (
        <View className="bg-background/70 absolute bottom-0 left-0 right-0 top-0 items-center justify-center">
          <View className="border-border bg-card flex-row items-center gap-2 rounded-xl border px-4 py-3">
            <Icon as={Trash2} size={14} className="text-destructive" />
            <Text className="text-foreground text-xs">Discarding…</Text>
          </View>
        </View>
      ) : null}

      <ReviewFinishSheet
        visible={finishOpen}
        onClose={() => setFinishOpen(false)}
        finish={finish}
        summary={summary}
        busy={busy}
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
