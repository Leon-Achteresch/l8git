import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import {
  Bot,
  Folders,
  Inbox,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

const TAB_ICONS: Record<string, LucideIcon> = {
  index: Inbox,
  repos: Folders,
  agents: Bot,
  dashboard: LayoutDashboard,
  settings: Settings,
};

export type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}
      className="bg-background flex-row items-center px-6 pt-2.5">
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const icon = TAB_ICONS[route.name] ?? Inbox;
        const badge = typeof options.tabBarBadge === 'number' ? options.tabBarBadge : undefined;

        const onPress = () => {
          if (Platform.OS !== 'web') {
            void Haptics.selectionAsync();
          }
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.title ?? route.name}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            className="flex-1 items-center gap-1.5 py-1">
            <View>
              <Icon
                as={icon}
                size={24}
                color={focused ? palette.foreground : palette.mutedForeground}
              />
              {badge && badge > 0 ? (
                <View className="bg-destructive absolute -right-2.5 -top-1.5 h-4 min-w-4 items-center justify-center rounded-full px-1">
                  <Text
                    style={{ fontVariant: ['tabular-nums'] }}
                    className="text-destructive-foreground text-2xs font-semibold">
                    {badge > 99 ? '99+' : badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <View
              className="h-1 w-1 rounded-full"
              style={{ backgroundColor: focused ? palette.foreground : 'transparent' }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
