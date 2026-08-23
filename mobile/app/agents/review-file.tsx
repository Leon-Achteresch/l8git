import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, FileWarning } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/empty-state';
import { DiffView } from '~/components/shared/diff-view';
import { splitPath } from '~/components/shared/format';
import { useBottomInset } from '~/components/shared/use-bottom-inset';
import { GlassCircle } from '~/components/ui/glass';
import { Text } from '~/components/ui/text';
import { useHostLabel, useReviewFileDiff } from '~/lib/agents/review';
import { decodeRouteValue } from '~/lib/repo/route';

export default function AgentReviewFileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    hostId?: string;
    path?: string;
    base?: string;
    file?: string;
  }>();
  const hostId = decodeRouteValue(params.hostId);
  const worktreePath = decodeRouteValue(params.path);
  const mergeBase = decodeRouteValue(params.base);
  const file = decodeRouteValue(params.file);
  const hostName = useHostLabel(hostId);
  const bottom = useBottomInset();

  const query = useReviewFileDiff(hostId, worktreePath, mergeBase, file);
  const payload = query.data;
  const { name, dir } = splitPath(file);

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        <GlassCircle
          icon={ArrowLeft}
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/agents/reviews'))}
        />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-foreground text-2xl font-bold tracking-tight">
            {name || 'File'}
          </Text>
          <Text numberOfLines={1} className="text-muted-foreground text-sm">
            {dir || hostName}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottom + 24 }}
        contentContainerClassName="gap-2 px-5 pt-1"
        showsVerticalScrollIndicator={false}>
        {payload?.isBinary ? (
          <EmptyState
            icon={FileWarning}
            title="Binary file"
            description="This change cannot be rendered as a text diff."
          />
        ) : (
          <>
            <View className="bg-white/[0.06] self-start rounded-full px-2.5 py-1">
              <Text className="text-muted-foreground font-mono text-2xs">
                base {mergeBase.slice(0, 10)}
              </Text>
            </View>
            <DiffView
              diff={payload?.diff ?? null}
              untracked={
                payload?.untrackedPlain !== null && payload?.untrackedPlain !== undefined
                  ? { path: file, content: payload.untrackedPlain }
                  : null
              }
              loading={query.isPending}
              error={query.error ? String(query.error) : null}
              onRetry={() => void query.refetch()}
              collapsible={false}
              emptyHint="No textual changes against the merge base."
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
