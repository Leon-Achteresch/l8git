import { Tabs } from 'expo-router';

import { useInboxBadgeCount } from '~/components/inbox/use-inbox';
import { TabBar } from '~/components/tab-bar';
import { useAgentApprovalBadge } from '~/lib/agents/overview-actions';
import { palette } from '~/lib/theme';

export default function TabsLayout() {
  const inboxBadge = useInboxBadgeCount();
  const agentBadge = useAgentApprovalBadge();

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: palette.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarBadge: inboxBadge > 0 ? inboxBadge : undefined }}
      />
      <Tabs.Screen name="repos" options={{ title: 'Repos' }} />
      <Tabs.Screen
        name="agents"
        options={{ title: 'Agents', tabBarBadge: agentBadge > 0 ? agentBadge : undefined }}
      />
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
