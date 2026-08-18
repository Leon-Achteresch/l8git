import { Cloud, GitBranch, MoreVertical, Plus, Tag as TagIcon } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { EmptyState } from '~/components/empty-state';
import {
  BranchActionSheet,
  CreateBranchSheet,
  TagActionSheet,
} from '~/components/repo/branches/branch-sheets';
import {
  useBranchActivity,
  useRepoOverview,
  useRepoRefresh,
  useRepoScope,
  useUpstreamSync,
} from '~/components/repo/git-queries';
import { GitToast, useGitToast } from '~/components/repo/git-toast';
import type { Branch, TagRef } from '~/components/repo/git-types';
import { SearchField } from '~/components/repo/history/search-field';
import { OfflineState, QueryErrorState } from '~/components/repo/repo-states';
import { useRepoRoute } from '~/lib/repo/route';
import { middleTruncate, shortHash } from '~/components/shared/format';
import { BranchRow } from '~/components/shared/branch-row';
import { PressableRow } from '~/components/shared/pressable-row';
import { StatusPill } from '~/components/shared/status-pill';
import { SkeletonList } from '~/components/skeleton-list';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

type Segment = 'local' | 'remote' | 'tags';

const SEGMENT_LABEL: Record<Segment, string> = {
  local: 'Local',
  remote: 'Remote',
  tags: 'Tags',
};

const TAG_TONE = {
  lightweight: 'neutral',
  annotated: 'branch',
  signed: 'success',
} as const;

function SegmentBar({
  value,
  counts,
  onChange,
}: {
  value: Segment;
  counts: Record<Segment, number>;
  onChange: (next: Segment) => void;
}) {
  return (
    <View className="bg-muted/70 flex-row gap-1 rounded-xl p-1">
      {(Object.keys(SEGMENT_LABEL) as Segment[]).map((segment) => {
        const active = segment === value;
        return (
          <Pressable
            key={segment}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(segment)}
            className={cn(
              'flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-1.5',
              active ? 'bg-card border-border border' : 'active:bg-accent/50'
            )}>
            <Text
              className={cn(
                'text-xs font-medium',
                active ? 'text-foreground' : 'text-muted-foreground'
              )}>
              {SEGMENT_LABEL[segment]}
            </Text>
            <Text
              className={cn(
                'font-mono text-2xs',
                active ? 'text-muted-foreground' : 'text-muted-foreground/60'
              )}>
              {counts[segment]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TagRowItem({
  tag,
  first,
  last,
  onPress,
}: {
  tag: TagRef;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  return (
    <PressableRow first={first} last={last} onPress={onPress} onLongPress={onPress}>
      <View className="flex-row items-center gap-2.5 px-3 py-2.5">
        <View className="border-git-tag/30 bg-git-tag/12 h-7 w-7 items-center justify-center rounded-lg border">
          <Icon as={TagIcon} size={13} className="text-git-tag" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className="text-foreground text-sm font-medium">
            {middleTruncate(tag.name, 38)}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Text className="text-git-hash font-mono text-2xs">{shortHash(tag.commit)}</Text>
            <Text numberOfLines={1} className="text-muted-foreground flex-1 text-xs">
              {[tag.message?.trim(), tag.tagger].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
        <StatusPill label={tag.kind} tone={TAG_TONE[tag.kind] ?? 'neutral'} size="xs" />
        <Icon as={MoreVertical} size={15} className="text-muted-foreground" />
      </View>
    </PressableRow>
  );
}

export default function RepoBranchesScreen() {
  const { hostId, repoPath } = useRepoRoute();
  const scope = useRepoScope(hostId, repoPath);
  const toast = useGitToast();
  const refreshRepo = useRepoRefresh(scope);

  const overview = useRepoOverview(scope);
  const activity = useBranchActivity(scope);
  const upstream = useUpstreamSync(scope);

  const [segment, setSegment] = React.useState<Segment>('local');
  const [filter, setFilter] = React.useState('');
  const [branchTarget, setBranchTarget] = React.useState<Branch | null>(null);
  const [tagTarget, setTagTarget] = React.useState<TagRef | null>(null);
  const [creating, setCreating] = React.useState(false);

  const currentBranch = overview.data?.branch ?? '';

  const dates = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of activity.data ?? []) {
      map.set(`${entry.is_remote ? 'r' : 'l'}:${entry.name}`, entry.last_commit_at);
    }
    return map;
  }, [activity.data]);

  const branches = overview.data?.branches ?? [];
  const tags = overview.data?.tags ?? [];

  const counts = React.useMemo<Record<Segment, number>>(
    () => ({
      local: branches.filter((branch) => !branch.is_remote).length,
      remote: branches.filter((branch) => branch.is_remote).length,
      tags: tags.length,
    }),
    [branches, tags]
  );

  const needle = filter.trim().toLowerCase();

  const visibleBranches = React.useMemo(() => {
    const wantRemote = segment === 'remote';
    return branches
      .filter((branch) => branch.is_remote === wantRemote)
      .filter((branch) => (needle ? branch.name.toLowerCase().includes(needle) : true))
      .sort((a, b) => {
        if (a.is_current !== b.is_current) {
          return a.is_current ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  }, [branches, needle, segment]);

  const visibleTags = React.useMemo(
    () =>
      tags
        .filter((tag) => (needle ? tag.name.toLowerCase().includes(needle) : true))
        .sort((a, b) => b.name.localeCompare(a.name)),
    [needle, tags]
  );

  if (!scope.online) {
    return (
      <View className="bg-background flex-1">
        <OfflineState hostId={hostId} />
      </View>
    );
  }

  const listEmpty =
    segment === 'tags' ? (
      <EmptyState
        icon={TagIcon}
        title={needle ? 'No matching tags' : 'No tags yet'}
        description={
          needle ? 'Try another name.' : 'Tag a commit from the history screen to mark a release.'
        }
      />
    ) : (
      <EmptyState
        icon={segment === 'remote' ? Cloud : GitBranch}
        title={
          needle
            ? 'No matching branches'
            : segment === 'remote'
              ? 'No remote branches'
              : 'No local branches'
        }
        description={
          needle
            ? 'Try another name.'
            : segment === 'remote'
              ? 'Fetch the repository to see remote-tracking branches.'
              : 'Create a branch to start working on something new.'
        }
      />
    );

  return (
    <View className="bg-background flex-1">
      <View className="gap-2 px-4 pb-2 pt-1">
        <SegmentBar value={segment} counts={counts} onChange={setSegment} />
        <View className="flex-row items-center gap-2">
          <SearchField
            value={filter}
            onChangeText={setFilter}
            placeholder={segment === 'tags' ? 'Filter tags' : 'Filter branches'}
            className="flex-1"
          />
          <Button
            size="icon"
            variant="secondary"
            accessibilityLabel="New branch"
            onPress={() => setCreating(true)}>
            <Icon as={Plus} size={16} className="text-foreground" />
          </Button>
        </View>
        {currentBranch ? (
          <View className="flex-row items-center gap-2 px-0.5">
            <Icon as={GitBranch} size={12} className="text-git-branch" />
            <Text numberOfLines={1} className="text-muted-foreground flex-1 text-xs">
              on <Text className="text-git-branch text-xs font-medium">{currentBranch}</Text>
            </Text>
            {upstream.data && (upstream.data.ahead > 0 || upstream.data.behind > 0) ? (
              <View className="flex-row gap-1">
                {upstream.data.ahead > 0 ? (
                  <StatusPill label={`↑${upstream.data.ahead}`} tone="added" size="xs" mono />
                ) : null}
                {upstream.data.behind > 0 ? (
                  <StatusPill label={`↓${upstream.data.behind}`} tone="removed" size="xs" mono />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {overview.isError ? (
        <View className="px-4">
          <QueryErrorState
            title="Could not load branches"
            error={overview.error}
            onRetry={() => void overview.refetch()}
          />
        </View>
      ) : overview.isPending ? (
        <View className="px-4 pt-1">
          <SkeletonList rows={7} />
        </View>
      ) : segment === 'tags' ? (
        <Animated.View key="tags" entering={FadeIn.duration(160)} className="flex-1">
          <FlatList
            data={visibleTags}
            keyExtractor={(tag) => tag.name}
            contentContainerClassName="px-4 pb-24"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={listEmpty}
            refreshControl={
              <RefreshControl
                refreshing={overview.isRefetching}
                onRefresh={refreshRepo}
                tintColor={palette.mutedForeground}
              />
            }
            renderItem={({ item, index }) => (
              <TagRowItem
                tag={item}
                first={index === 0}
                last={index === visibleTags.length - 1}
                onPress={() => setTagTarget(item)}
              />
            )}
          />
        </Animated.View>
      ) : (
        <Animated.View key={segment} entering={FadeIn.duration(160)} className="flex-1">
          <FlatList
            data={visibleBranches}
            keyExtractor={(branch) => `${branch.is_remote ? 'r' : 'l'}:${branch.name}`}
            contentContainerClassName="px-4 pb-24"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={listEmpty}
            refreshControl={
              <RefreshControl
                refreshing={overview.isRefetching}
                onRefresh={refreshRepo}
                tintColor={palette.mutedForeground}
              />
            }
            renderItem={({ item, index }) => (
              <BranchRow
                name={item.name}
                current={item.is_current}
                remote={item.is_remote}
                tip={item.tip}
                behind={item.behind ?? null}
                ahead={item.is_current ? (upstream.data?.ahead ?? null) : null}
                date={dates.get(`${item.is_remote ? 'r' : 'l'}:${item.name}`) ?? null}
                first={index === 0}
                last={index === visibleBranches.length - 1}
                onPress={() => setBranchTarget(item)}
                onLongPress={() => setBranchTarget(item)}
                trailing={<Icon as={MoreVertical} size={15} className="text-muted-foreground" />}
              />
            )}
          />
        </Animated.View>
      )}

      <BranchActionSheet
        scope={scope}
        branch={branchTarget}
        currentBranch={currentBranch}
        toast={toast}
        onClose={() => setBranchTarget(null)}
      />
      <TagActionSheet
        scope={scope}
        tag={tagTarget}
        toast={toast}
        onClose={() => setTagTarget(null)}
      />
      <CreateBranchSheet
        scope={scope}
        visible={creating}
        baseRef={currentBranch}
        toast={toast}
        onClose={() => setCreating(false)}
      />
      <GitToast notice={toast.notice} onDismiss={toast.dismiss} />
    </View>
  );
}
