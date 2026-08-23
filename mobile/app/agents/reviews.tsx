import { useRouter } from 'expo-router';
import { ArrowLeft, GitBranch, GitPullRequestArrow } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/empty-state';
import { PressableRow } from '~/components/shared/pressable-row';
import { SkeletonList } from '~/components/skeleton-list';
import { GlassCircle } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import {
  agentReviewHref,
  useAgentWorktreeSessions,
  type AgentWorktreeSession,
} from '~/lib/agents/review';

function SessionRow({
  session,
  first,
  last,
  onPress,
}: {
  session: AgentWorktreeSession;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  return (
    <PressableRow
      first={first}
      last={last}
      onPress={onPress}
      accessibilityLabel={`Review ${session.name}`}>
      <View className="flex-row items-center gap-3 px-4 py-3.5">
        <View className="bg-white/10 h-10 w-10 items-center justify-center rounded-full">
          <Icon as={GitBranch} size={16} className="text-foreground" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className="text-foreground text-base font-semibold">
            {session.name}
          </Text>
          <Text numberOfLines={1} className="text-muted-foreground text-xs">
            {session.repoName} · {session.hostName}
          </Text>
        </View>
        {session.branch ? (
          <View className="bg-white/[0.06] max-w-32 rounded-full px-2.5 py-1">
            <Text numberOfLines={1} className="text-muted-foreground font-mono text-2xs">
              {session.branch}
            </Text>
          </View>
        ) : null}
      </View>
    </PressableRow>
  );
}

export default function AgentReviewsScreen() {
  const router = useRouter();
  const { sessions, loading } = useAgentWorktreeSessions();

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <View className="flex-row items-center gap-3 px-5 pb-4 pt-2">
        <GlassCircle
          icon={ArrowLeft}
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/agents'))}
        />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-foreground text-3xl font-bold tracking-tight">
            Reviews
          </Text>
          <Text numberOfLines={1} className="text-muted-foreground text-sm">
            {sessions.length > 0
              ? `${sessions.length} agent session${sessions.length === 1 ? '' : 's'} ready to review`
              : 'Agent sessions running in their own worktree'}
          </Text>
        </View>
      </View>

      {loading && sessions.length === 0 ? (
        <View className="px-5 pt-1">
          <SkeletonList rows={4} avatar />
        </View>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={GitPullRequestArrow}
          title="No agent worktrees"
          description="Sessions started on an agents/* branch in a dedicated worktree show up here for review."
        />
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => `${item.hostId}:${item.worktreePath}`}
          contentContainerClassName="px-5 pb-16 pt-1"
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <SessionRow
              session={item}
              first={index === 0}
              last={index === sessions.length - 1}
              onPress={() => router.push(agentReviewHref(item.hostId, item.worktreePath))}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
