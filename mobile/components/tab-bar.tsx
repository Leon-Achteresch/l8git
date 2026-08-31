import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import {
  Bot,
  ChartNoAxesColumn,
  FolderGit2,
  House,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

const TAB_ICONS: Record<string, LucideIcon> = {
  index: House,
  repos: FolderGit2,
  agents: Bot,
  dashboard: ChartNoAxesColumn,
  settings: UserRound,
};

const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  repos: 'Repos',
  agents: 'Agents',
  dashboard: 'Dashboard',
  settings: 'You',
};

export const TAB_BAR_HEIGHT = 108;

export type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: Math.max(insets.bottom, 12),
        alignItems: 'center',
      }}>
      <Glass
        intensity={56}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 36,
        }}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const icon = TAB_ICONS[route.name] ?? House;
          const badge = typeof options.tabBarBadge === 'number' ? options.tabBarBadge : 0;
          const label = TAB_LABELS[route.name] ?? options.title ?? route.name;

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
              style={{
                minWidth: 58,
                height: 62,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                backgroundColor: focused ? 'rgba(255,255,255,0.16)' : 'transparent',
              }}>
              <Icon
                as={icon}
                size={21}
                strokeWidth={focused ? 2.2 : 1.7}
                color={focused ? palette.foreground : palette.mutedForeground}
              />
              <Text
                className={
                  focused ? 'text-foreground text-2xs font-semibold' : 'text-muted-foreground text-2xs'
                }>
                {label}
              </Text>
              {badge > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 10,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    paddingHorizontal: 4,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: palette.destructive,
                    borderWidth: 2,
                    borderColor: palette.background,
                  }}>
                  <Text
                    style={{ fontVariant: ['tabular-nums'] }}
                    className="text-2xs font-bold text-white">
                    {badge > 99 ? '99+' : badge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}
