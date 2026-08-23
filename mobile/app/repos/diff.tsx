import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Minus, Plus, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiffView } from '~/components/shared/diff-view';
import { splitPath } from '~/components/shared/format';
import { Fade, GlassCircle, GlassPill, SolidPill } from '~/components/ui/glass';
import { Text } from '~/components/ui/text';
import { useHostRuntime } from '~/lib/connections';
import {
  useDiscardFiles,
  useFileDiff,
  useStageFiles,
  useUnstageFiles,
} from '~/lib/repo/queries';
import { decodeRepoParam } from '~/lib/repo/route';
import { palette } from '~/lib/theme';
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

  const goBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/repos');
  }, [router]);

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
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        <GlassCircle icon={ArrowLeft} label="Back" onPress={goBack} />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-foreground text-xl font-bold tracking-tight">
            {name}
          </Text>
          {dir ? (
            <Text numberOfLines={1} className="text-muted-foreground text-xs">
              {dir}
            </Text>
          ) : null}
        </View>
        <GlassCircle
          icon={Trash2}
          label="Discard changes"
          color={palette.destructive}
          onPress={confirmDiscard}
        />
      </View>

      {hasStaged && hasUnstaged ? (
        <View className="flex-row gap-2 px-5 pb-3">
          {(['unstaged', 'staged'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: side === value }}
              onPress={() => setSide(value)}
              className={cn(
                'h-9 flex-1 items-center justify-center rounded-full',
                side === value ? 'bg-primary' : 'bg-card'
              )}>
              <Text
                className={cn(
                  'text-sm font-semibold',
                  side === value ? 'text-primary-foreground' : 'text-muted-foreground'
                )}>
                {value === 'staged' ? 'Staged' : 'Working copy'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScrollView
        contentContainerClassName="gap-3 px-5 pb-36 pt-1"
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
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <Fade height={120} />
        <View
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          className="flex-row items-center justify-center gap-3 px-5 pt-3">
          {side === 'staged' ? (
            <GlassPill
              icon={Minus}
              label="Unstage"
              onPress={() => {
                feedback();
                unstage.mutate([file]);
              }}
              style={{ flex: 1 }}
            />
          ) : (
            <SolidPill
              icon={Plus}
              label="Stage file"
              onPress={() => {
                feedback();
                stage.mutate([file]);
              }}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
