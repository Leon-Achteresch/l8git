import { useRouter } from 'expo-router';
import { Archive, MoreVertical, Plus } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { EmptyState } from '~/components/empty-state';
import { useRepoRefresh, useRepoScope, useStashes } from '~/components/repo/git-queries';
import { GitToast, useGitToast } from '~/components/repo/git-toast';
import type { StashEntry } from '~/components/repo/git-types';
import { OfflineState, QueryErrorState } from '~/components/repo/repo-states';
import { useRepoRoute } from '~/lib/repo/route';
import { PushStashSheet, StashActionSheet, stashLabel } from '~/components/repo/stash/stash-sheets';
import { relativeTime, shortHash } from '~/components/shared/format';
import { PressableRow } from '~/components/shared/pressable-row';
import { SkeletonList } from '~/components/skeleton-list';
import { SolidPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

function StashRow({
  entry,
  first,
  last,
  onPress,
  onActions,
}: {
  entry: StashEntry;
  first: boolean;
  last: boolean;
  onPress: () => void;
  onActions: () => void;
}) {
  return (
    <PressableRow
      first={first}
      last={last}
      onPress={onPress}
      onLongPress={onActions}
      accessibilityLabel={`Stash ${entry.index}`}>
      <View className="flex-row items-center gap-3 py-3.5 pl-4 pr-3">
        <View
          style={{ backgroundColor: `${palette.git.merge}26` }}
          className="h-11 w-11 items-center justify-center rounded-full">
          <Text
            style={{ color: palette.git.merge, fontVariant: ['tabular-nums'] }}
            className="font-mono text-sm">
            {entry.index}
          </Text>
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className="text-foreground text-base font-semibold">
            {stashLabel(entry)}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Text
              style={{ fontVariant: ['tabular-nums'] }}
              className="text-muted-foreground font-mono text-xs">
              {shortHash(entry.hash)}
            </Text>
            <Text numberOfLines={1} className="text-muted-foreground flex-1 text-xs">
              {[entry.branch, relativeTime(entry.date)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
        <Pressable
          hitSlop={10}
          accessibilityLabel="Stash actions"
          onPress={onActions}
          className="bg-white/5 active:bg-white/10 h-9 w-9 items-center justify-center rounded-full">
          <Icon as={MoreVertical} size={16} color={palette.mutedForeground} />
        </Pressable>
      </View>
    </PressableRow>
  );
}

export default function RepoStashScreen() {
  const router = useRouter();
  const { hostId, repoPath } = useRepoRoute();
  const scope = useRepoScope(hostId, repoPath);
  const toast = useGitToast();
  const refreshRepo = useRepoRefresh(scope);

  const stashes = useStashes(scope);
  const [target, setTarget] = React.useState<StashEntry | null>(null);
  const [pushing, setPushing] = React.useState(false);

  const entries = stashes.data ?? [];

  const openDiff = React.useCallback(
    (index: number) => {
      router.push({
        pathname: '/repos/[hostId]/[repo]/stash/[stashIndex]',
        params: { hostId, repo: repoPath, stashIndex: String(index) },
      });
    },
    [hostId, repoPath, router]
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
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-1">
        <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
          <Text className="text-foreground text-base font-semibold">Stashes</Text>
          <Text style={{ fontVariant: ['tabular-nums'] }} className="text-muted-foreground text-sm">
            {entries.length === 0
              ? 'Nothing parked'
              : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stash changes"
          onPress={() => setPushing(true)}
          className="bg-card active:bg-elevated h-11 flex-row items-center gap-1.5 rounded-full pl-3.5 pr-4">
          <Icon as={Plus} size={15} color={palette.foreground} />
          <Text className="text-foreground text-sm font-semibold">Stash changes</Text>
        </Pressable>
      </View>

      {stashes.isError ? (
        <View className="px-5">
          <QueryErrorState
            title="Could not load stashes"
            error={stashes.error}
            onRetry={() => void stashes.refetch()}
          />
        </View>
      ) : stashes.isPending ? (
        <View className="px-5 pt-1">
          <SkeletonList rows={4} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(entry) => `${entry.index}:${entry.hash}`}
          contentContainerClassName="px-5 pb-24"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={stashes.isRefetching}
              onRefresh={refreshRepo}
              tintColor={palette.mutedForeground}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={Archive}
              title="No stashes"
              description="Stash your working tree to switch context without committing."
              action={
                <SolidPill icon={Plus} label="Stash changes" onPress={() => setPushing(true)} />
              }
            />
          }
          ListHeaderComponent={
            entries.length > 0 ? (
              <Text className="text-muted-foreground px-1 pb-2 text-xs font-medium uppercase tracking-widest">
                Newest first
              </Text>
            ) : null
          }
          renderItem={({ item, index }) => (
            <StashRow
              entry={item}
              first={index === 0}
              last={index === entries.length - 1}
              onPress={() => openDiff(item.index)}
              onActions={() => setTarget(item)}
            />
          )}
        />
      )}

      <StashActionSheet
        scope={scope}
        entry={target}
        toast={toast}
        onClose={() => setTarget(null)}
        onShowDiff={openDiff}
      />
      <PushStashSheet
        scope={scope}
        visible={pushing}
        toast={toast}
        onClose={() => setPushing(false)}
      />
      <GitToast notice={toast.notice} onDismiss={toast.dismiss} />
    </View>
  );
}
