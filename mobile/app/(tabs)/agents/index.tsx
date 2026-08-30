import { View } from 'react-native';

import { AgentRuntimeGate } from '~/components/agents/agent-runtime-gate';
import { AgentsOverview } from '~/components/agents/agents-overview';
import { AgentsOverviewSkeleton } from '~/components/agents/agents-overview-skeleton';
import { Screen, ScreenTitle } from '~/components/screen';

export default function AgentsScreen() {
  return (
    <Screen contentClassName="px-0">
      <AgentRuntimeGate
        fallback={
          <View className="flex-1 px-4">
            <ScreenTitle title="Agents" subtitle="Starting the agent runtime…" />
            <AgentsOverviewSkeleton />
          </View>
        }>
        <AgentsOverview />
      </AgentRuntimeGate>
    </Screen>
  );
}
