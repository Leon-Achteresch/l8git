import { useRouter } from 'expo-router';
import { GitBranch, GitPullRequestArrow } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/empty-state';
import { DetailHeader } from '~/components/shared/detail-header';
import { PressableRow } from '~/components/shared/pressable-row';
import { StatusPill } from '~/components/shared/status-pill';
import { SkeletonList } from '~/components/skeleton-list';
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
      <View className="flex-row items-center gap-2.5 px-3 py-3">
        <View className="border-git-branch/30 bg-git-branch/12 h-8 w-8 items-center justify-center rounded-lg border">
          <Icon as={GitBranch} size={14} className="text-git-branch" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className="text-foreground text-sm font-medium">
            {session.name}
          </Text>
          <Text numberOfLines={1} className="text-muted-foreground text-2xs">
            {session.repoName} · {session.hostName}
          </Text>
        </View>
        {session.branch ? (
          <StatusPill label={session.branch} tone="branch" size="xs" mono />
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
      <DetailHeader
        title="Worktree reviews"
        subtitle={
          sessions.length > 0
            ? `${sessions.length} agent session${sessions.length === 1 ? '' : 's'} ready to review`
            : 'Agent sessions running in their own worktree'
        }
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/agents'))}
      />

      {loading && sessions.length === 0 ? (
        <View className="px-4 pt-3">
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
          contentContainerClassName="px-4 pb-16 pt-3"
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
