import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Minus, PlugZap } from 'lucide-react-native';
import * as React from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DetailHeader } from '~/components/shared/detail-header';
import { DiffView } from '~/components/shared/diff-view';
import { EmptyState } from '~/components/empty-state';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { useConnections, useHostRuntime } from '~/lib/connections';
import { useRepoStatus, useStagedDiff, useUnstageFiles } from '~/lib/repo/queries';
import { decodeRepoParam } from '~/lib/repo/route';
import { buildSections } from '~/lib/repo/types';
import { palette } from '~/lib/theme';

export default function StagedDiffScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ hostId?: string; repo?: string }>();

  const hostId = typeof params.hostId === 'string' ? params.hostId : '';
  const repoPath = decodeRepoParam(params.repo);
  const runtime = useHostRuntime(hostId);
  const connect = useConnections((state) => state.connect);
  const online = runtime.status === 'online';

  const diff = useStagedDiff(hostId, repoPath, online);
  const status = useRepoStatus(hostId, repoPath, online);
  const unstage = useUnstageFiles(hostId, repoPath);

  const stagedPaths = React.useMemo(
    () => buildSections(status.data?.entries).staged.map((item) => item.path),
    [status.data?.entries]
  );

  const unstageAll = React.useCallback(() => {
    if (stagedPaths.length === 0) {
      return;
    }
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    unstage.mutate(stagedPaths);
    router.back();
  }, [router, stagedPaths, unstage]);

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <DetailHeader
        title="Staged changes"
        subtitle={
          stagedPaths.length > 0
            ? `${stagedPaths.length} ${stagedPaths.length === 1 ? 'file' : 'files'} ready to commit`
            : 'Nothing staged'
        }
      />

      {!online ? (
        <EmptyState
          icon={PlugZap}
          title="Host offline"
          description={runtime.lastError ?? 'Reconnect to review the staged diff.'}
          action={
            <Button size="sm" variant="secondary" onPress={() => void connect(hostId)}>
              <Text className="text-xs">Connect</Text>
            </Button>
          }
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-2 px-4 pb-24 pt-3"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={diff.isRefetching}
              onRefresh={() => void diff.refetch()}
              tintColor={palette.mutedForeground}
            />
          }>
          <DiffView
            diff={diff.data}
            loading={diff.isPending}
            error={
              diff.isError
                ? diff.error instanceof Error
                  ? diff.error.message
                  : 'Unknown error'
                : null
            }
            onRetry={() => void diff.refetch()}
            emptyHint="Stage a file to review it here before committing."
          />
        </ScrollView>
      )}

      {online && stagedPaths.length > 0 ? (
        <View
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          className="border-border bg-sidebar border-t px-4 pt-2.5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Unstage everything"
            onPress={unstageAll}
            className="border-border bg-card/70 h-10 flex-row items-center justify-center gap-2 rounded-xl border active:opacity-70">
            <Icon as={Minus} size={14} className="text-foreground" />
            <Text className="text-foreground text-sm font-medium">Unstage everything</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
