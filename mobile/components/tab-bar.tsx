import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import {
  Bot,
  ChartNoAxesColumn,
  FolderGit2,
  House,
  Settings,
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
  settings: Settings,
};

export const TAB_BAR_HEIGHT = 92;

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
        bottom: Math.max(insets.bottom, 14) + 2,
        alignItems: 'center',
      }}>
      <View
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.55,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 14,
          borderRadius: 40,
        }}>
        <Glass
          intensity={50}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            padding: 8,
            borderRadius: 40,
            backgroundColor: 'rgba(18,18,20,0.86)',
          }}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const icon = TAB_ICONS[route.name] ?? House;
            const badge = typeof options.tabBarBadge === 'number' ? options.tabBarBadge : 0;

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
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: focused ? 'rgba(255,255,255,0.14)' : 'transparent',
                }}>
                <Icon
                  as={icon}
                  size={23}
                  strokeWidth={focused ? 2.4 : 2}
                  color={focused ? palette.foreground : palette.mutedForeground}
                />
                {badge > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      paddingHorizontal: 4,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: palette.destructive,
                      borderWidth: 2,
                      borderColor: '#141416',
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
    </View>
  );
}
