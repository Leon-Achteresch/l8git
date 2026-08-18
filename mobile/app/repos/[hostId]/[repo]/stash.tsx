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
import { StatusPill } from '~/components/shared/status-pill';
import { SkeletonList } from '~/components/skeleton-list';
import { Button } from '~/components/ui/button';
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
      <View className="flex-row items-center gap-2.5 px-3 py-2.5">
        <View className="border-git-merge/30 bg-git-merge/12 h-7 w-7 items-center justify-center rounded-lg border">
          <Text className="text-git-merge font-mono text-2xs">{entry.index}</Text>
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className="text-foreground text-sm font-medium">
            {stashLabel(entry)}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Text className="text-git-hash font-mono text-2xs">{shortHash(entry.hash)}</Text>
            <Text numberOfLines={1} className="text-muted-foreground flex-1 text-xs">
              {[entry.branch, relativeTime(entry.date)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
        <Pressable hitSlop={10} accessibilityLabel="Stash actions" onPress={onActions}>
          <Icon as={MoreVertical} size={15} className="text-muted-foreground" />
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
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-1">
        <View className="flex-1">
          <Text className="text-foreground text-sm font-medium">Stashes</Text>
          <Text className="text-muted-foreground text-xs">
            {entries.length === 0
              ? 'Nothing parked right now'
              : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`}
          </Text>
        </View>
        <Button size="sm" variant="secondary" onPress={() => setPushing(true)}>
          <Icon as={Plus} size={14} className="text-foreground" />
          <Text className="text-xs">Stash changes</Text>
        </Button>
      </View>

      {stashes.isError ? (
        <View className="px-4">
          <QueryErrorState
            title="Could not load stashes"
            error={stashes.error}
            onRetry={() => void stashes.refetch()}
          />
        </View>
      ) : stashes.isPending ? (
        <View className="px-4 pt-1">
          <SkeletonList rows={4} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(entry) => `${entry.index}:${entry.hash}`}
          contentContainerClassName="px-4 pb-24"
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
                <Button size="sm" variant="outline" onPress={() => setPushing(true)}>
                  <Text className="text-xs">Stash changes</Text>
                </Button>
              }
            />
          }
          ListHeaderComponent={
            entries.length > 0 ? (
              <View className="flex-row items-center gap-2 pb-2">
                <StatusPill label="newest first" tone="neutral" size="xs" />
              </View>
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
