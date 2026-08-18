import { useLocalSearchParams, useRouter } from 'expo-router';
import { Layers, MoreVertical } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ChangedFilesSection } from '~/components/repo/changed-files';
import { DetailHeader } from '~/components/shared/detail-header';
import {
  useRepoScope,
  useStashFileDiff,
  useStashInspect,
  useStashes,
} from '~/components/repo/git-queries';
import { GitToast, useGitToast } from '~/components/repo/git-toast';
import { parseCommitHeader } from '~/components/repo/git-types';
import { OfflineState, QueryErrorState } from '~/components/repo/repo-states';
import { decodeRouteValue, useRepoRoute } from '~/lib/repo/route';
import { StashActionSheet, stashLabel } from '~/components/repo/stash/stash-sheets';
import { relativeTime, shortHash } from '~/components/shared/format';
import { StatusPill } from '~/components/shared/status-pill';
import { SkeletonList } from '~/components/skeleton-list';
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';

export default function StashDetailScreen() {
  const router = useRouter();
  const { hostId, repoPath } = useRepoRoute();
  const params = useLocalSearchParams<{ stashIndex?: string }>();
  const index = Number.parseInt(decodeRouteValue(params.stashIndex) || '0', 10);
  const scope = useRepoScope(hostId, repoPath);
  const toast = useGitToast();

  const inspect = useStashInspect(scope, index);
  const stashes = useStashes(scope);
  const [selected, setSelected] = React.useState<string | null>(null);
  const fileDiff = useStashFileDiff(scope, index, selected);
  const [actionsOpen, setActionsOpen] = React.useState(false);

  const entry = React.useMemo(
    () => (stashes.data ?? []).find((item) => item.index === index) ?? null,
    [index, stashes.data]
  );
  const header = React.useMemo(() => parseCommitHeader(inspect.data?.header), [inspect.data]);

  return (
    <View className="bg-background flex-1">
      <DetailHeader
        title={entry ? stashLabel(entry) : `stash@{${index}}`}
        subtitle={entry ? `stash@{${index}} · ${entry.branch}` : header.subject || undefined}
        right={
          <Pressable
            accessibilityLabel="Stash actions"
            hitSlop={8}
            disabled={!entry}
            onPress={() => setActionsOpen(true)}
            className="active:bg-accent h-9 w-9 items-center justify-center rounded-lg">
            <Icon as={MoreVertical} size={17} className="text-foreground" />
          </Pressable>
        }
      />

      {!scope.online ? (
        <OfflineState hostId={hostId} />
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-4 pb-24 pt-3"
          showsVerticalScrollIndicator={false}>
          {inspect.isPending ? (
            <View className="gap-3">
              <View className="border-border bg-card/40 gap-3 rounded-2xl border p-4">
                <Skeleton className="h-4 w-2/3 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </View>
              <SkeletonList rows={4} />
            </View>
          ) : inspect.isError ? (
            <QueryErrorState
              title="Could not load the stash"
              error={inspect.error}
              onRetry={() => void inspect.refetch()}
            />
          ) : (
            <>
              <Animated.View
                entering={FadeInDown.duration(220).springify().damping(20)}
                className="border-border bg-card/50 gap-2 rounded-2xl border p-4">
                <View className="flex-row items-center gap-2">
                  <Icon as={Layers} size={14} className="text-git-merge" />
                  <Text className="text-foreground flex-1 text-sm font-medium">
                    {header.subject || (entry ? stashLabel(entry) : `stash@{${index}}`)}
                  </Text>
                  <StatusPill label={`stash@{${index}}`} tone="merge" size="xs" mono />
                </View>
                <Text className="text-muted-foreground text-xs">
                  {[
                    entry?.branch,
                    header.hash ? shortHash(header.hash) : null,
                    relativeTime(entry?.date ?? header.authorDate),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {header.body ? (
                  <Text className="text-muted-foreground text-xs leading-5">{header.body}</Text>
                ) : null}
              </Animated.View>

              <ChangedFilesSection
                files={inspect.data?.files ?? []}
                selected={selected}
                onSelect={setSelected}
                diff={fileDiff.data}
                loading={fileDiff.isPending && Boolean(selected)}
                error={fileDiff.isError ? fileDiff.error : null}
                onRetry={() => void fileDiff.refetch()}
                title="Stashed files"
              />
            </>
          )}
        </ScrollView>
      )}

      <StashActionSheet
        scope={scope}
        entry={actionsOpen ? entry : null}
        toast={toast}
        onClose={() => setActionsOpen(false)}
        onShowDiff={() => setActionsOpen(false)}
        onConsumed={() => {
          if (router.canGoBack()) {
            router.back();
          }
        }}
      />
      <GitToast notice={toast.notice} onDismiss={toast.dismiss} />
    </View>
  );
}
