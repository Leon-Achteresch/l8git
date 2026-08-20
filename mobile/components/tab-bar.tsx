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
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
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

const SPRING = { damping: 20, stiffness: 240, mass: 0.7 } as const;

export type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

function TabItem({
  focused,
  icon,
  label,
  badge,
  onPress,
  onLongPress,
}: {
  focused: boolean;
  icon: LucideIcon;
  label: string;
  badge?: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const active = useSharedValue(focused ? 1 : 0);

  React.useEffect(() => {
    active.value = withSpring(focused ? 1 : 0, SPRING);
  }, [active, focused]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scale: 0.86 + active.value * 0.14 }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + active.value * 0.04 }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      className="flex-1 items-center justify-center py-1">
      <View className="h-12 w-full items-center justify-center overflow-hidden rounded-full">
        <Animated.View
          pointerEvents="none"
          style={[
            pillStyle,
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: palette.primary,
              borderRadius: 999,
            },
          ]}
        />
        <Animated.View style={contentStyle} className="items-center justify-center gap-0.5">
          <View>
            <Icon
              as={icon}
              size={19}
              color={focused ? palette.primaryForeground : palette.mutedForeground}
            />
            {badge && badge > 0 ? (
              <View className="bg-destructive absolute -right-2 -top-1.5 h-4 min-w-4 items-center justify-center rounded-full px-1">
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-destructive-foreground font-mono text-2xs">
                  {badge > 99 ? '99+' : badge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={focused ? { color: palette.primaryForeground } : undefined}
            className={
              focused ? 'text-2xs font-semibold' : 'text-muted-foreground text-2xs'
            }>
            {label}
          </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const mounted = useSharedValue(0);

  React.useEffect(() => {
    mounted.value = withTiming(1, { duration: 260 });
  }, [mounted]);

  const barStyle = useAnimatedStyle(() => ({
    opacity: mounted.value,
    transform: [{ translateY: (1 - mounted.value) * 16 }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{ paddingBottom: Math.max(insets.bottom, 10), paddingHorizontal: 14 }}
      className="bg-transparent">
      <Animated.View
        style={[
          barStyle,
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: palette.elevated,
            borderColor: palette.border,
            borderWidth: 1,
            borderRadius: 999,
            padding: 6,
            shadowColor: '#000',
            shadowOpacity: 0.4,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
            elevation: 12,
          },
        ]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);

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

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <TabItem
              key={route.key}
              focused={focused}
              icon={TAB_ICONS[route.name] ?? Inbox}
              label={label}
              badge={typeof options.tabBarBadge === 'number' ? options.tabBarBadge : undefined}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}
