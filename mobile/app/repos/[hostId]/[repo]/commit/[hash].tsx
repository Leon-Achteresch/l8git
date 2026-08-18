import { useLocalSearchParams, useRouter } from 'expo-router';
import { GitMerge, MoreVertical, Tag } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ChangedFilesSection } from '~/components/repo/changed-files';
import { DetailHeader } from '~/components/shared/detail-header';
import { useCommitFileDiff, useCommitInspect, useRepoScope } from '~/components/repo/git-queries';
import { GitToast, useGitToast } from '~/components/repo/git-toast';
import { parseCommitHeader } from '~/components/repo/git-types';
import {
  CommitActionSheet,
  type CommitTarget,
} from '~/components/repo/history/commit-action-sheet';
import { OfflineState, QueryErrorState } from '~/components/repo/repo-states';
import { decodeRouteValue, useRepoRoute } from '~/lib/repo/route';
import { accentFor, initials, relativeTime, shortHash } from '~/components/shared/format';
import { StatusPill } from '~/components/shared/status-pill';
import { SkeletonList } from '~/components/skeleton-list';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start gap-3">
      <Text className="text-muted-foreground w-24 text-xs">{label}</Text>
      <Text className="text-foreground flex-1 text-xs">{value}</Text>
    </View>
  );
}

export default function CommitDetailScreen() {
  const router = useRouter();
  const { hostId, repoPath } = useRepoRoute();
  const params = useLocalSearchParams<{ hash?: string }>();
  const hash = decodeRouteValue(params.hash);
  const scope = useRepoScope(hostId, repoPath);
  const toast = useGitToast();

  const inspect = useCommitInspect(scope, hash);
  const [selected, setSelected] = React.useState<string | null>(null);
  const fileDiff = useCommitFileDiff(scope, hash, selected);
  const [actionsOpen, setActionsOpen] = React.useState(false);

  const header = React.useMemo(() => parseCommitHeader(inspect.data?.header), [inspect.data]);
  const isMerge = header.merge.length > 1;

  const target = React.useMemo<CommitTarget | null>(
    () =>
      actionsOpen
        ? { hash, subject: header.subject || shortHash(hash), parents: header.merge }
        : null,
    [actionsOpen, hash, header.merge, header.subject]
  );

  const tint = accentFor(header.authorEmail ?? header.author ?? hash);

  return (
    <View className="bg-background flex-1">
      <DetailHeader
        title={header.subject || 'Commit'}
        subtitle={shortHash(hash, 10)}
        right={
          <Pressable
            accessibilityLabel="Commit actions"
            hitSlop={8}
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
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
                <Skeleton className="h-3 w-2/5 rounded" />
              </View>
              <SkeletonList rows={5} />
            </View>
          ) : inspect.isError ? (
            <QueryErrorState
              title="Could not load the commit"
              error={inspect.error}
              onRetry={() => void inspect.refetch()}
            />
          ) : (
            <>
              <Animated.View
                entering={FadeInDown.duration(220).springify().damping(20)}
                className="border-border bg-card/50 gap-3 rounded-2xl border p-4">
                <View className="flex-row items-start gap-3">
                  <Avatar alt={header.author ?? 'Author'} className="size-9">
                    <AvatarFallback style={{ backgroundColor: `${tint}26` }}>
                      <Text style={{ color: tint }} className="text-xs font-semibold">
                        {initials(header.author)}
                      </Text>
                    </AvatarFallback>
                  </Avatar>
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="text-foreground text-base font-medium leading-5">
                      {header.subject || '(no subject)'}
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {[header.author, relativeTime(header.authorDate)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {isMerge ? (
                    <StatusPill label="merge" tone="merge" size="xs" icon={GitMerge} />
                  ) : null}
                </View>

                {header.body ? (
                  <Text className="text-muted-foreground text-sm leading-5">{header.body}</Text>
                ) : null}

                {header.refs.length > 0 ? (
                  <View className="flex-row flex-wrap gap-1">
                    {header.refs.map((ref) => (
                      <StatusPill
                        key={ref}
                        label={ref.replace(/^tag: /, '')}
                        tone={ref.startsWith('tag: ') ? 'warning' : 'branch'}
                        size="xs"
                        icon={ref.startsWith('tag: ') ? Tag : undefined}
                      />
                    ))}
                  </View>
                ) : null}

                <View className="border-border/60 gap-1.5 border-t pt-3">
                  <MetaRow label="Commit" value={header.hash ?? hash} />
                  {header.authorEmail ? (
                    <MetaRow label="Author" value={`${header.author} <${header.authorEmail}>`} />
                  ) : null}
                  {header.authorDate ? <MetaRow label="Authored" value={header.authorDate} /> : null}
                  {header.committer && header.committer !== header.author ? (
                    <MetaRow label="Committer" value={header.committer} />
                  ) : null}
                  {header.commitDate && header.commitDate !== header.authorDate ? (
                    <MetaRow label="Committed" value={header.commitDate} />
                  ) : null}
                  {header.merge.length > 0 ? (
                    <View className="flex-row items-center gap-2 pt-1">
                      <Text className="text-muted-foreground w-24 text-xs">Parents</Text>
                      <View className="flex-1 flex-row flex-wrap gap-1.5">
                        {header.merge.map((parent) => (
                          <Pressable
                            key={parent}
                            onPress={() =>
                              router.push({
                                pathname: '/repos/[hostId]/[repo]/commit/[hash]',
                                params: { hostId, repo: repoPath, hash: parent },
                              })
                            }
                            className="border-border bg-muted/60 active:bg-accent rounded-md border px-1.5 py-0.5">
                            <Text className="text-git-hash font-mono text-2xs">
                              {shortHash(parent)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              </Animated.View>

              <ChangedFilesSection
                files={inspect.data?.files ?? []}
                selected={selected}
                onSelect={setSelected}
                diff={fileDiff.data}
                loading={fileDiff.isPending && Boolean(selected)}
                error={fileDiff.isError ? fileDiff.error : null}
                onRetry={() => void fileDiff.refetch()}
              />
            </>
          )}
        </ScrollView>
      )}

      <CommitActionSheet
        scope={scope}
        commit={target}
        toast={toast}
        onClose={() => setActionsOpen(false)}
      />
      <GitToast notice={toast.notice} onDismiss={toast.dismiss} />
    </View>
  );
}
