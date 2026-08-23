import { useLocalSearchParams, useRouter } from 'expo-router';
import { Layers, MoreVertical } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
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
import { GlassCircle } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

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
          <GlassCircle
            icon={MoreVertical}
            label="Stash actions"
            onPress={entry ? () => setActionsOpen(true) : undefined}
            style={{ opacity: entry ? 1 : 0.45 }}
          />
        }
      />

      {!scope.online ? (
        <OfflineState hostId={hostId} />
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-5 pb-24 pt-2"
          showsVerticalScrollIndicator={false}>
          {inspect.isPending ? (
            <View className="gap-3">
              <View className="bg-card gap-3 rounded-[28px] p-5">
                <Skeleton className="h-4 w-2/3 rounded-full" />
                <Skeleton className="h-3 w-1/2 rounded-full" />
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
                className="bg-card gap-4 rounded-[28px] p-5">
                <View className="flex-row items-start gap-3.5">
                  <View
                    style={{ backgroundColor: `${palette.git.merge}26` }}
                    className="h-12 w-12 items-center justify-center rounded-full">
                    <Icon as={Layers} size={20} color={palette.git.merge} />
                  </View>
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="text-foreground text-lg font-semibold leading-6">
                      {header.subject || (entry ? stashLabel(entry) : `stash@{${index}}`)}
                    </Text>
                    <Text
                      style={{ fontVariant: ['tabular-nums'] }}
                      className="text-muted-foreground text-xs">
                      {[
                        entry?.branch,
                        header.hash ? shortHash(header.hash) : null,
                        relativeTime(entry?.date ?? header.authorDate),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <StatusPill label={`stash@{${index}}`} tone="merge" size="xs" mono />
                </View>
                {header.body ? (
                  <Text selectable className="text-muted-foreground text-sm leading-5">
                    {header.body}
                  </Text>
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
