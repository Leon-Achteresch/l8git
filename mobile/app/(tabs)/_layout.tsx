import { Tabs } from 'expo-router';
import { Bot, Folders, Inbox, LayoutDashboard, Settings, type LucideIcon } from 'lucide-react-native';
import { Platform } from 'react-native';

import { useInboxBadgeCount } from '~/components/inbox/use-inbox';
import { Icon } from '~/components/ui/icon';
import { TabBar } from '~/components/tab-bar';
import { useAgentApprovalBadge } from '~/lib/agents/overview-actions';
import { palette } from '~/lib/theme';

const ICONS: Record<string, LucideIcon> = {
  index: Inbox,
  repos: Folders,
  agents: Bot,
  dashboard: LayoutDashboard,
  settings: Settings,
};

const nativeTabBar = Platform.OS === 'ios';

export default function TabsLayout() {
  const inboxBadge = useInboxBadgeCount();
  const agentBadge = useAgentApprovalBadge();

  return (
    <Tabs
      tabBar={nativeTabBar ? undefined : (props) => <TabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: palette.background },
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.mutedForeground,
        tabBarStyle: {
          backgroundColor: palette.sidebar,
          borderTopColor: palette.border,
        },
        tabBarIcon: ({ color, size }) => (
          <Icon as={ICONS[route.name] ?? Inbox} size={size ?? 24} color={color} />
        ),
      })}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Inbox', tabBarBadge: inboxBadge > 0 ? inboxBadge : undefined }}
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
