import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Minus, PlugZap } from 'lucide-react-native';
import * as React from 'react';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiffView } from '~/components/shared/diff-view';
import { EmptyState } from '~/components/empty-state';
import { Fade, GlassCircle, GlassPill, SolidPill } from '~/components/ui/glass';
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

  const goBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/repos');
  }, [router]);

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
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        <GlassCircle icon={ArrowLeft} label="Back" onPress={goBack} />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-foreground text-xl font-bold tracking-tight">
            Staged changes
          </Text>
          <Text numberOfLines={1} className="text-muted-foreground text-xs">
            {stagedPaths.length > 0
              ? `${stagedPaths.length} ${stagedPaths.length === 1 ? 'file' : 'files'} ready to commit`
              : 'Nothing staged'}
          </Text>
        </View>
      </View>

      {!online ? (
        <EmptyState
          icon={PlugZap}
          title="Host offline"
          description={runtime.lastError ?? 'Reconnect to review the staged diff.'}
          action={<SolidPill label="Connect" onPress={() => void connect(hostId)} />}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-5 pb-36 pt-1"
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
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <Fade height={120} />
          <View
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            className="items-center px-5 pt-3">
            <GlassPill icon={Minus} label="Unstage everything" onPress={unstageAll} />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
