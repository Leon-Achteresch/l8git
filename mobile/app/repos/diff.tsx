import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Minus, Plus, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DetailHeader } from '~/components/shared/detail-header';
import { DiffView } from '~/components/shared/diff-view';
import { splitPath } from '~/components/shared/format';
import { Icon } from '~/components/ui/icon';
import { Separator } from '~/components/ui/separator';
import { Text } from '~/components/ui/text';
import { useHostRuntime } from '~/lib/connections';
import {
  useDiscardFiles,
  useFileDiff,
  useStageFiles,
  useUnstageFiles,
} from '~/lib/repo/queries';
import { decodeRepoParam } from '~/lib/repo/route';
import { cn } from '~/lib/utils';

type Side = 'staged' | 'unstaged';

export default function RepoFileDiffScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    hostId?: string;
    repo?: string;
    file?: string;
    sector?: string;
    untracked?: string;
  }>();

  const hostId = typeof params.hostId === 'string' ? params.hostId : '';
  const repoPath = decodeRepoParam(params.repo);
  const file = decodeRepoParam(params.file);
  const untracked = params.untracked === '1';
  const runtime = useHostRuntime(hostId);
  const online = runtime.status === 'online';

  const [side, setSide] = React.useState<Side>(
    params.sector === 'staged' ? 'staged' : 'unstaged'
  );

  const diff = useFileDiff(hostId, repoPath, file, untracked, online);
  const stage = useStageFiles(hostId, repoPath);
  const unstage = useUnstageFiles(hostId, repoPath);
  const discard = useDiscardFiles(hostId, repoPath);

  const payload = diff.data;
  const hasStaged = Boolean(payload?.staged?.trim());
  const hasUnstaged = Boolean(payload?.unstaged?.trim());
  const plain = payload?.untracked_plain ?? null;

  React.useEffect(() => {
    if (side === 'staged' && !hasStaged && hasUnstaged) {
      setSide('unstaged');
    }
    if (side === 'unstaged' && !hasUnstaged && hasStaged) {
      setSide('staged');
    }
  }, [hasStaged, hasUnstaged, side]);

  const insets = useSafeAreaInsets();
  const { name, dir } = splitPath(file);

  const feedback = React.useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const confirmDiscard = React.useCallback(() => {
    Alert.alert('Discard changes?', `${file}\n\nThis cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          if (Platform.OS !== 'web') {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
          discard.mutate({ files: [file], worktreeOnly: true });
          router.back();
        },
      },
    ]);
  }, [discard, file, router]);

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <DetailHeader title={name} subtitle={dir || undefined} />

      {hasStaged && hasUnstaged ? (
        <>
          <View className="flex-row gap-1 px-4 pb-2 pt-2">
            {(['unstaged', 'staged'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: side === value }}
                onPress={() => setSide(value)}
                className={cn(
                  'flex-1 items-center rounded-lg border py-1.5',
                  side === value ? 'border-border bg-secondary' : 'border-transparent bg-muted/40'
                )}>
                <Text
                  className={cn(
                    'text-xs',
                    side === value ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}>
                  {value === 'staged' ? 'Staged' : 'Working copy'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Separator />
        </>
      ) : null}

      <ScrollView
        contentContainerClassName="gap-2 px-4 pb-28 pt-3"
        showsVerticalScrollIndicator={false}>
        <DiffView
          diff={untracked ? null : side === 'staged' ? payload?.staged : payload?.unstaged}
          untracked={untracked && plain !== null ? { path: file, content: plain } : null}
          files={payload?.is_binary ? [] : undefined}
          loading={diff.isPending}
          error={
            diff.isError
              ? diff.error instanceof Error
                ? diff.error.message
                : 'Unknown error'
              : null
          }
          onRetry={() => void diff.refetch()}
          collapsible={false}
          emptyHint={
            payload?.is_binary
              ? 'Binary file — no textual diff available.'
              : 'This file has no changes on the selected side.'
          }
        />
      </ScrollView>

      <View
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        className="border-border bg-sidebar flex-row gap-2 border-t px-4 pt-2.5">
        {side === 'staged' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              feedback();
              unstage.mutate([file]);
            }}
            className="border-border bg-card/70 h-10 flex-1 flex-row items-center justify-center gap-2 rounded-xl border active:opacity-70">
            <Icon as={Minus} size={14} className="text-foreground" />
            <Text className="text-foreground text-sm font-medium">Unstage</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              feedback();
              stage.mutate([file]);
            }}
            className="bg-primary h-10 flex-1 flex-row items-center justify-center gap-2 rounded-xl active:opacity-90">
            <Icon as={Plus} size={14} className="text-primary-foreground" />
            <Text className="text-primary-foreground text-sm font-semibold">Stage file</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Discard changes"
          onPress={confirmDiscard}
          className="border-destructive/40 bg-destructive/10 h-10 w-12 items-center justify-center rounded-xl border active:opacity-70">
          <Icon as={Trash2} size={15} className="text-destructive" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
