import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  CheckCheck,
  CircleCheck,
  FileDiff,
  PlugZap,
  RotateCw,
  TriangleAlert,
} from 'lucide-react-native';
import * as React from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import {
  ChangeRow,
  DISCARD_ICON,
  RESOLVE_ICON,
  STAGE_ICON,
  UNSTAGE_ICON,
  type ChangeRowAction,
} from '~/components/repo/change-row';
import { CommitComposer } from '~/components/repo/commit-composer';
import { RemoteToolbar } from '~/components/repo/remote-toolbar';
import { EmptyState } from '~/components/empty-state';
import { SkeletonList } from '~/components/skeleton-list';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { useConnections, useHostRuntime } from '~/lib/connections';
import {
  useCommitChanges,
  useDiscardFiles,
  useHeadCommit,
  useRepoStatus,
  useStageFiles,
  useUnstageFiles,
} from '~/lib/repo/queries';
import { useRemoteOpRunner } from '~/lib/repo/remote-ops';
import { useRepoRoute } from '~/lib/repo/route';
import { palette } from '~/lib/theme';
import {
  buildSections,
  commitMessageOf,
  type ChangeItem,
  type ChangeSector,
} from '~/lib/repo/types';

const DIFF_ROUTE = '/repos/diff' as const;
const STAGED_ROUTE = '/repos/staged' as const;

type Row =
  | {
      type: 'header';
      key: string;
      title: string;
      count: number;
      sector: ChangeSector;
      paths: string[];
    }
  | { type: 'file'; key: string; item: ChangeItem; first: boolean; last: boolean };

function haptic(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (Platform.OS !== 'web') {
    void Haptics.impactAsync(style);
  }
}

export default function RepoStatusScreen() {
  const router = useRouter();
  const { hostId, repoPath } = useRepoRoute();
  const runtime = useHostRuntime(hostId);
  const connect = useConnections((state) => state.connect);
  const online = runtime.status === 'online';

  const status = useRepoStatus(hostId, repoPath, online);
  const stage = useStageFiles(hostId, repoPath);
  const unstage = useUnstageFiles(hostId, repoPath);
  const discard = useDiscardFiles(hostId, repoPath);
  const commit = useCommitChanges(hostId, repoPath);
  const remote = useRemoteOpRunner(hostId, repoPath);
  const head = useHeadCommit(hostId, repoPath, online);

  const [message, setMessage] = React.useState('');
  const [amend, setAmend] = React.useState(false);
  const [commitError, setCommitError] = React.useState<string | null>(null);

  const onAmendChange = React.useCallback(
    (next: boolean) => {
      setAmend(next);
      setCommitError(null);
      if (next && message.trim().length === 0) {
        setMessage(commitMessageOf(head.data));
      }
    },
    [head.data, message]
  );

  const sections = React.useMemo(
    () => buildSections(status.data?.entries),
    [status.data?.entries]
  );

  const runStage = React.useCallback(
    (files: string[]) => {
      if (files.length === 0) {
        return;
      }
      haptic();
      stage.mutate(files);
    },
    [stage]
  );

  const runUnstage = React.useCallback(
    (files: string[]) => {
      if (files.length === 0) {
        return;
      }
      haptic();
      unstage.mutate(files);
    },
    [unstage]
  );

  const confirmDiscard = React.useCallback(
    (files: string[], worktreeOnly: boolean) => {
      if (files.length === 0) {
        return;
      }
      const label =
        files.length === 1 ? files[0] : `${files.length} files will lose their changes.`;
      Alert.alert(
        worktreeOnly ? 'Discard working-copy changes?' : 'Discard changes?',
        `${label}\n\nThis cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              if (Platform.OS !== 'web') {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              }
              discard.mutate({ files, worktreeOnly });
            },
          },
        ]
      );
    },
    [discard]
  );

  const openDiff = React.useCallback(
    (item: ChangeItem) => {
      router.push({
        pathname: DIFF_ROUTE,
        params: {
          hostId,
          repo: repoPath,
          file: item.path,
          sector: item.sector,
          untracked: item.sector === 'untracked' ? '1' : '0',
        },
      });
    },
    [hostId, repoPath, router]
  );

  const openStagedDiff = React.useCallback(() => {
    router.push({ pathname: STAGED_ROUTE, params: { hostId, repo: repoPath } });
  }, [hostId, repoPath, router]);

  const showActions = React.useCallback(
    (item: ChangeItem) => {
      const buttons: Parameters<typeof Alert.alert>[2] = [{ text: 'Cancel', style: 'cancel' }];
      buttons.push({ text: 'View diff', onPress: () => openDiff(item) });
      if (item.sector === 'conflict') {
        buttons.push({ text: 'Mark resolved', onPress: () => runStage([item.path]) });
      } else if (item.sector === 'staged') {
        buttons.push({ text: 'Unstage', onPress: () => runUnstage([item.path]) });
        buttons.push({
          text: 'Discard everything',
          style: 'destructive',
          onPress: () => confirmDiscard([item.path], false),
        });
      } else {
        buttons.push({ text: 'Stage', onPress: () => runStage([item.path]) });
        buttons.push({
          text: 'Discard',
          style: 'destructive',
          onPress: () => confirmDiscard([item.path], true),
        });
      }
      Alert.alert(item.path, undefined, buttons);
    },
    [confirmDiscard, openDiff, runStage, runUnstage]
  );

  const actionsFor = React.useCallback(
    (item: ChangeItem): ChangeRowAction[] => {
      if (item.sector === 'conflict') {
        return [
          {
            key: 'resolve',
            label: 'Resolved',
            icon: RESOLVE_ICON,
            run: () => runStage([item.path]),
          },
        ];
      }
      if (item.sector === 'staged') {
        return [
          {
            key: 'unstage',
            label: 'Unstage',
            icon: UNSTAGE_ICON,
            run: () => runUnstage([item.path]),
          },
        ];
      }
      return [
        { key: 'stage', label: 'Stage', icon: STAGE_ICON, run: () => runStage([item.path]) },
        {
          key: 'discard',
          label: 'Discard',
          icon: DISCARD_ICON,
          destructive: true,
          run: () => confirmDiscard([item.path], true),
        },
      ];
    },
    [confirmDiscard, runStage, runUnstage]
  );

  const rows = React.useMemo<Row[]>(() => {
    const out: Row[] = [];
    const push = (title: string, sector: ChangeSector, items: ChangeItem[]) => {
      if (items.length === 0) {
        return;
      }
      out.push({
        type: 'header',
        key: `header:${sector}`,
        title,
        count: items.length,
        sector,
        paths: items.map((item) => item.path),
      });
      items.forEach((item, index) => {
        out.push({
          type: 'file',
          key: item.key,
          item,
          first: index === 0,
          last: index === items.length - 1,
        });
      });
    };
    push('Conflicts', 'conflict', sections.conflicts);
    push('Staged', 'staged', sections.staged);
    push('Changes', 'unstaged', sections.unstaged);
    push('Untracked', 'untracked', sections.untracked);
    return out;
  }, [sections]);

  const onCommit = React.useCallback(() => {
    setCommitError(null);
    commit.mutate(
      { message: message.trim(), amend },
      {
        onSuccess: () => {
          setMessage('');
          setAmend(false);
        },
        onError: (error) => {
          setCommitError(error instanceof Error ? error.message : String(error));
        },
      }
    );
  }, [amend, commit, message]);

  const renderItem = React.useCallback(
    ({ item }: { item: Row }) => {
      if (item.type === 'header') {
        const stageAll = item.sector === 'unstaged' || item.sector === 'untracked';
        return (
          <View className="flex-row items-center justify-between px-4 pb-1.5 pt-4">
            <View className="flex-row items-center gap-2">
              <Text className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
                {item.title}
              </Text>
              <Text className="text-muted-foreground/60 font-mono text-xs">{item.count}</Text>
            </View>
            <View className="flex-row items-center gap-3.5">
              {item.sector === 'staged' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Review the staged diff"
                  hitSlop={8}
                  onPress={openStagedDiff}
                  className="flex-row items-center gap-1 active:opacity-60">
                  <Icon as={FileDiff} size={12} className="text-muted-foreground" />
                  <Text className="text-muted-foreground text-2xs font-medium">Review</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() =>
                  item.sector === 'staged' ? runUnstage(item.paths) : runStage(item.paths)
                }
                className="flex-row items-center gap-1 active:opacity-60">
                <Icon
                  as={
                    item.sector === 'conflict'
                      ? RESOLVE_ICON
                      : stageAll
                        ? STAGE_ICON
                        : UNSTAGE_ICON
                  }
                  size={12}
                  className="text-muted-foreground"
                />
                <Text className="text-muted-foreground text-2xs font-medium">
                  {item.sector === 'conflict'
                    ? 'Mark all resolved'
                    : stageAll
                      ? 'Stage all'
                      : 'Unstage all'}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      }

      return (
        <View className="px-4">
          <ChangeRow
            item={item.item}
            actions={actionsFor(item.item)}
            first={item.first}
            last={item.last}
            onPress={() => openDiff(item.item)}
            onLongPress={() => showActions(item.item)}
          />
        </View>
      );
    },
    [actionsFor, openDiff, openStagedDiff, runStage, runUnstage, showActions]
  );

  if (!online) {
    return (
      <EmptyState
        icon={PlugZap}
        title="Host offline"
        description={runtime.lastError ?? 'Reconnect to inspect this working copy.'}
        action={
          <Button size="sm" variant="secondary" onPress={() => void connect(hostId)}>
            <Text className="text-xs">Connect</Text>
          </Button>
        }
      />
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      className="flex-1">
      <RemoteToolbar
        ahead={status.data?.upstream_sync.ahead ?? 0}
        behind={status.data?.upstream_sync.behind ?? 0}
        hasUpstream={status.data?.has_upstream !== false}
        busy={remote.busy}
        disabled={!online}
        onRun={(op) =>
          void remote.run(op, {
            setUpstream: op === 'push' && status.data?.has_upstream === false,
          })
        }
      />

      {status.isPending ? (
        <View className="px-4 pt-2">
          <SkeletonList rows={7} />
        </View>
      ) : status.isError ? (
        <View className="px-4 pt-4">
          <View className="border-destructive/30 bg-destructive/5 gap-3 rounded-xl border p-4">
            <View className="flex-row items-center gap-2">
              <Icon as={TriangleAlert} size={14} className="text-destructive" />
              <Text className="text-destructive text-sm font-medium">
                Could not read the working copy
              </Text>
            </View>
            <Text className="text-muted-foreground text-xs">
              {status.error instanceof Error ? status.error.message : 'Unknown error'}
            </Text>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onPress={() => void status.refetch()}>
              <Icon as={RotateCw} size={13} className="text-foreground" />
              <Text className="text-xs">Retry</Text>
            </Button>
          </View>
        </View>
      ) : rows.length === 0 ? (
        <Animated.View entering={FadeIn.duration(180)} className="flex-1">
          <EmptyState
            icon={CircleCheck}
            title="Working copy is clean"
            description="Nothing to stage — pull or switch branches to keep going."
          />
        </Animated.View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderItem}
          contentContainerClassName="pb-6"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          initialNumToRender={16}
          windowSize={9}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl
              refreshing={status.isRefetching}
              onRefresh={() => void status.refetch()}
              tintColor={palette.mutedForeground}
            />
          }
          ListHeaderComponent={
            sections.staged.length > 0 && sections.total > sections.staged.length ? (
              <View className="flex-row items-center gap-2 px-4 pt-2">
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    runStage([
                      ...sections.unstaged.map((item) => item.path),
                      ...sections.untracked.map((item) => item.path),
                    ])
                  }
                  className="border-border bg-card/60 flex-row items-center gap-1.5 rounded-full border px-2.5 py-1 active:opacity-70">
                  <Icon as={CheckCheck} size={12} className="text-git-added" />
                  <Text className="text-foreground text-2xs font-medium">Stage everything</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      )}

      <CommitComposer
        stagedCount={sections.staged.length}
        amendSubject={head.data?.subject ?? null}
        amend={amend}
        onAmendChange={onAmendChange}
        message={message}
        onMessageChange={setMessage}
        onCommit={onCommit}
        committing={commit.isPending}
        disabled={!online}
        error={commitError}
      />
    </KeyboardAvoidingView>
  );
}
