import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CheckCheck, FileWarning, RotateCw } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from 'zustand';

import { EmptyState } from '~/components/empty-state';
import { DiffView } from '~/components/shared/diff-view';
import { splitPath } from '~/components/shared/format';
import { useBottomInset } from '~/components/shared/use-bottom-inset';
import { GlassCircle, SolidPill } from '~/components/ui/glass';
import { Text } from '~/components/ui/text';
import { isAgentSessionBusyNow, useAgentSessionBusy, useHostLabel, useReviewFileDiff, type AgentReviewFileDiff } from '~/lib/agents/review';
import { reviewProgressStore, subscribeReviewProgressCache, type DisplayedReviewFile, type ReviewProgressAvailability } from '~/lib/agents/review-progress';
import { useConnections, useHostRuntime } from '~/lib/connections';
import { hostQueryKey } from '~/lib/query';
import { decodeRouteValue } from '~/lib/repo/route';

export default function AgentReviewFileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    hostId?: string;
    path?: string;
    base?: string;
    file?: string;
  }>();
  const hostId = decodeRouteValue(params.hostId);
  const worktreePath = decodeRouteValue(params.path);
  const mergeBase = decodeRouteValue(params.base);
  const file = decodeRouteValue(params.file);
  const hostName = useHostLabel(hostId);
  const bottom = useBottomInset();
  const queryClient = useQueryClient();
  const online = useHostRuntime(hostId).status === 'online';
  const busy = useAgentSessionBusy(hostId, worktreePath);

  const query = useReviewFileDiff(hostId, worktreePath, mergeBase, file);
  const payload = query.data;
  const { name, dir } = splitPath(file);
  const context = React.useMemo(() => ({ hostId, worktreePath, mergeBase }), [hostId, worktreePath, mergeBase]);
  const routeKey = JSON.stringify([hostId, worktreePath, mergeBase, file]);
  const progress = useStore(reviewProgressStore);
  const [displayed, setDisplayed] = React.useState<DisplayedReviewFile | null>(null);
  const [focused, setFocused] = React.useState(false);
  const focusedRef = React.useRef(false);
  const refetchRef = React.useRef(query.refetch);
  refetchRef.current = query.refetch;
  useFocusEffect(React.useCallback(() => {
    focusedRef.current = true;
    setFocused(true);
    reviewProgressStore.getState().begin(context);
    // Cached data can predate an agent write while this route was closed.
    void refetchRef.current();
    return () => { focusedRef.current = false; setFocused(false); };
  }, [context, file]));
  React.useEffect(() => subscribeReviewProgressCache(queryClient.getQueryCache(), context), [queryClient, context]);
  React.useEffect(() => {
    if (busy || !online) reviewProgressStore.getState().invalidate(context);
  }, [context, busy, online]);

  const capturedResponse = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!query.isSuccess || query.isFetching || query.error || !query.isFetchedAfterMount ||
        !focusedRef.current || !online || busy || !payload?.fingerprint) {
      setDisplayed(null);
      return;
    }
    const response = JSON.stringify([routeKey, query.dataUpdatedAt, payload.fingerprint]);
    if (capturedResponse.current === response) return;
    capturedResponse.current = response;
    setDisplayed(reviewProgressStore.getState().display(context, file, payload.fingerprint));
  }, [routeKey, context, file, payload?.fingerprint, query.dataUpdatedAt, query.isSuccess,
    query.isFetching, query.error, query.isFetchedAfterMount, online, busy, focused]);

  const current = React.useRef<ReviewProgressAvailability>({
    ...context, file, fingerprint: payload?.fingerprint, online, busy, focused,
    loading: query.isPending || !query.isFetchedAfterMount, fetching: query.isFetching, error: query.error,
  });
  current.current = { ...context, file, fingerprint: payload?.fingerprint, online, busy, focused,
    loading: query.isPending || !query.isFetchedAfterMount, fetching: query.isFetching, error: query.error };
  const readCurrent = (): ReviewProgressAvailability => {
    const value = current.current;
    const latest = queryClient.getQueryState<AgentReviewFileDiff>(
      hostQueryKey(value.hostId, value.worktreePath, 'agent-review', 'file', value.mergeBase, value.file)
    );
    return { ...value,
      fingerprint: latest?.data?.fingerprint,
      online: value.online && useConnections.getState().runtime[value.hostId]?.status === 'online',
      busy: value.busy || isAgentSessionBusyNow(value.hostId, value.worktreePath),
      focused: value.focused && focusedRef.current,
      loading: value.loading || latest?.status !== 'success',
      fetching: value.fetching || latest?.fetchStatus !== 'idle' || Boolean(latest?.isInvalidated),
      error: latest?.error ?? value.error,
    };
  };
  const canMark = progress.canMark(displayed, readCurrent());
  const marked = Boolean(canMark && displayed && progress.marks[file] === displayed.fingerprint);
  const markHint = !online ? 'Reconnect the host before marking this file reviewed.' : busy
    ? 'Wait for the agent turn to finish, then refresh this preview.' : query.isPending || query.isFetching
      ? 'Wait for the file preview to finish loading.' : query.error
        ? 'Retry the preview before marking this file reviewed.' : !canMark
          ? 'Refresh the preview before marking this file reviewed.' : marked
            ? 'This displayed file has been marked reviewed.' : 'Read the displayed change, then mark this file reviewed.';

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        <GlassCircle
          icon={ArrowLeft}
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/agents/reviews'))}
        />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-foreground text-2xl font-bold tracking-tight">
            {name || 'File'}
          </Text>
          <Text numberOfLines={1} className="text-muted-foreground text-sm">
            {dir || hostName}
          </Text>
        </View>
        <GlassCircle icon={RotateCw} label="Refresh file preview" onPress={() => {
          if (!online || busy || query.isFetching) return;
          setDisplayed(null);
          void query.refetch();
        }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottom + 24 }}
        contentContainerClassName="gap-2 px-5 pt-1"
        showsVerticalScrollIndicator={false}>
        {payload?.isBinary && !query.error && !query.isPending ? (
          <EmptyState
            icon={FileWarning}
            title="Binary file"
            description="This change cannot be rendered as a text diff."
          />
        ) : (
          <>
            <View className="bg-white/[0.06] self-start rounded-full px-2.5 py-1">
              <Text className="text-muted-foreground font-mono text-2xs">
                base {mergeBase.slice(0, 10)}
              </Text>
            </View>
            <DiffView
              diff={payload?.diff ?? null}
              untracked={
                payload?.untrackedPlain !== null && payload?.untrackedPlain !== undefined
                  ? { path: file, content: payload.untrackedPlain }
                  : null
              }
              loading={query.isPending || query.isFetching}
              error={query.error ? String(query.error) : null}
              onRetry={() => void query.refetch()}
              collapsible={false}
              emptyHint="No textual changes against the merge base."
            />
          </>
        )}
        <View className="gap-2 pt-3">
          <Text className="text-muted-foreground text-xs leading-4">{markHint}</Text>
          <SolidPill icon={CheckCheck} label={marked ? 'Marked reviewed' : 'Mark reviewed'}
            disabled={!canMark || marked}
            onPress={() => reviewProgressStore.getState().mark(displayed, readCurrent())}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
