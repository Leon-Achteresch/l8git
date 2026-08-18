import { useRouter } from 'expo-router';
import { GitCommitHorizontal, MoreVertical, SearchX } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { EmptyState } from '~/components/empty-state';
import {
  SEARCH_MIN_CHARS,
  useCommitLog,
  useCommitSearch,
  useRepoRefresh,
  useRepoScope,
} from '~/components/repo/git-queries';
import { GitToast, useGitToast } from '~/components/repo/git-toast';
import type { Commit } from '~/components/repo/git-types';
import {
  CommitActionSheet,
  type CommitTarget,
} from '~/components/repo/history/commit-action-sheet';
import { SearchField, useDebounced } from '~/components/repo/history/search-field';
import { ListFooterLoader, OfflineState, QueryErrorState } from '~/components/repo/repo-states';
import { useRepoRoute } from '~/lib/repo/route';
import { CommitRow } from '~/components/shared/commit-row';
import { middleTruncate } from '~/components/shared/format';
import { StatusPill } from '~/components/shared/status-pill';
import { SkeletonList } from '~/components/skeleton-list';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

type Entry = {
  commit: Commit;
  matchedPaths: readonly string[];
};

export default function RepoHistoryScreen() {
  const router = useRouter();
  const { hostId, repoPath } = useRepoRoute();
  const scope = useRepoScope(hostId, repoPath);
  const toast = useGitToast();
  const refreshRepo = useRepoRefresh(scope);

  const [rawQuery, setRawQuery] = React.useState('');
  const query = useDebounced(rawQuery, 300);
  const searching = query.trim().length >= SEARCH_MIN_CHARS;

  const log = useCommitLog(scope);
  const search = useCommitSearch(scope, query);
  const [target, setTarget] = React.useState<CommitTarget | null>(null);

  const entries = React.useMemo<Entry[]>(() => {
    if (searching) {
      return (search.data?.pages ?? [])
        .flat()
        .map((hit) => ({ commit: hit.commit, matchedPaths: hit.matched_paths ?? [] }));
    }
    return (log.data?.pages ?? []).flat().map((commit) => ({ commit, matchedPaths: [] }));
  }, [log.data, search.data, searching]);

  const active = searching ? search : log;
  const loading = active.isPending && !active.isFetchingNextPage;

  const openCommit = React.useCallback(
    (hash: string) => {
      router.push({
        pathname: '/repos/[hostId]/[repo]/commit/[hash]',
        params: { hostId, repo: repoPath, hash },
      });
    },
    [hostId, repoPath, router]
  );

  const renderItem = React.useCallback(
    ({ item, index }: { item: Entry; index: number }) => {
      const isLast = index === entries.length - 1;
      const paths = item.matchedPaths;
      const open = () =>
        setTarget({
          hash: item.commit.hash,
          subject: item.commit.subject || item.commit.short_hash,
          parents: item.commit.parents,
        });

      return (
        <View>
          <CommitRow
            hash={item.commit.hash}
            subject={item.commit.subject || '(no subject)'}
            author={item.commit.author}
            email={item.commit.email}
            avatarUrl={item.commit.author_avatar ?? null}
            date={item.commit.date}
            tags={item.commit.tags}
            parents={item.commit.parents}
            connectTop={index > 0}
            connectBottom={!isLast}
            first={index === 0}
            last={isLast && paths.length === 0}
            onPress={() => openCommit(item.commit.hash)}
            onLongPress={open}
            trailing={
              <Pressable hitSlop={10} accessibilityLabel="Commit actions" onPress={open}>
                <Icon as={MoreVertical} size={16} className="text-muted-foreground" />
              </Pressable>
            }
          />
          {paths.length > 0 ? (
            <View
              className={cn(
                'border-border bg-card/30 flex-row flex-wrap gap-1 border-x border-b px-3 pb-2 pt-0.5',
                isLast && 'rounded-b-xl'
              )}>
              {paths.slice(0, 4).map((path) => (
                <StatusPill
                  key={path}
                  label={middleTruncate(path, 34)}
                  tone="modified"
                  size="xs"
                  mono
                />
              ))}
              {paths.length > 4 ? (
                <StatusPill label={`+${paths.length - 4}`} tone="neutral" size="xs" mono />
              ) : null}
            </View>
          ) : null}
        </View>
      );
    },
    [entries.length, openCommit]
  );

  if (!scope.online) {
    return (
      <View className="bg-background flex-1">
        <OfflineState hostId={hostId} />
      </View>
    );
  }

  return (
    <View className="bg-background flex-1">
      <View className="gap-2 px-4 pb-2 pt-1">
        <SearchField
          value={rawQuery}
          onChangeText={setRawQuery}
          placeholder="Search commits, authors, paths"
        />
        <View className="flex-row items-center justify-between px-0.5">
          <Text className="text-muted-foreground text-xs">
            {searching
              ? `${entries.length} match${entries.length === 1 ? '' : 'es'}`
              : `${entries.length} commit${entries.length === 1 ? '' : 's'} loaded`}
          </Text>
          {rawQuery.length > 0 && !searching ? (
            <Text className="text-muted-foreground/70 text-2xs">
              Type at least {SEARCH_MIN_CHARS} characters
            </Text>
          ) : null}
        </View>
      </View>

      {active.isError ? (
        <View className="px-4">
          <QueryErrorState
            title={searching ? 'Search failed' : 'Could not load history'}
            error={active.error}
            onRetry={() => void active.refetch()}
          />
        </View>
      ) : loading ? (
        <View className="px-4 pt-1">
          <SkeletonList rows={8} avatar />
        </View>
      ) : entries.length === 0 ? (
        <Animated.View entering={FadeIn.duration(180)} className="flex-1">
          <EmptyState
            icon={searching ? SearchX : GitCommitHorizontal}
            title={searching ? 'No matching commits' : 'No commits yet'}
            description={
              searching
                ? 'Try a different subject, author or file path.'
                : 'This repository has no commits on the current branch.'
            }
          />
        </Animated.View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.commit.hash}
          renderItem={renderItem}
          contentContainerClassName="px-4 pb-24"
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (active.hasNextPage && !active.isFetchingNextPage) {
              void active.fetchNextPage();
            }
          }}
          ListFooterComponent={
            <ListFooterLoader
              loading={active.isFetchingNextPage}
              label={searching ? 'Searching further back' : 'Loading older commits'}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={active.isRefetching && !active.isFetchingNextPage}
              onRefresh={refreshRepo}
              tintColor={palette.mutedForeground}
            />
          }
        />
      )}

      <CommitActionSheet
        scope={scope}
        commit={target}
        toast={toast}
        onClose={() => setTarget(null)}
      />
      <GitToast notice={toast.notice} onDismiss={toast.dismiss} />
    </View>
  );
}
