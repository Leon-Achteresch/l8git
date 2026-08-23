import { useRouter } from 'expo-router';
import { Bot } from 'lucide-react-native';

import { AgentRuntimeGate } from '~/components/agents/agent-runtime-gate';
import { AgentChatScreen } from '~/components/agents/chat/chat-screen';
import { useAgentThreadRoute } from '~/components/agents/chat/route';
import { EmptyState } from '~/components/empty-state';
import { Screen } from '~/components/screen';
import { SkeletonList } from '~/components/skeleton-list';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';

export default function AgentThreadRoute() {
  const router = useRouter();
  const route = useAgentThreadRoute();

  if (!route.ready || !route.provider) {
    return (
      <Screen edges={['top']}>
        <EmptyState
          icon={Bot}
          title="Conversation unavailable"
          description="This thread link is missing its host, provider or repository path."
          action={
            <Button
              variant="outline"
              size="sm"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/agents'))}>
              <Text>Go back</Text>
            </Button>
          }
        />
      </Screen>
    );
  }

  return (
    <AgentRuntimeGate
      fallback={
        <Screen edges={['top']}>
          <SkeletonList rows={6} avatar />
        </Screen>
      }>
      <AgentChatScreen
        hostId={route.hostId}
        provider={route.provider}
        threadId={route.threadId}
        path={route.path}
      />
    </AgentRuntimeGate>
  );
}
