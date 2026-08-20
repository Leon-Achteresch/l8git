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

const SPRING = { damping: 18, stiffness: 220, mass: 0.6 } as const;

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
    transform: [{ scaleX: 0.7 + active.value * 0.3 }, { scaleY: 0.6 + active.value * 0.4 }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -active.value * 1.5 }, { scale: 1 + active.value * 0.06 }],
    opacity: 0.55 + active.value * 0.45,
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + active.value * 0.5,
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      className="flex-1 items-center justify-center py-1.5">
      <View className="h-8 w-16 items-center justify-center">
        <Animated.View
          pointerEvents="none"
          style={pillStyle}
          className="bg-accent absolute h-8 w-16 rounded-lg"
        />
        <Animated.View style={iconStyle}>
          <Icon
            as={icon}
            size={20}
            color={focused ? palette.brand : palette.mutedForeground}
          />
        </Animated.View>
        {badge && badge > 0 ? (
          <View className="bg-destructive absolute -right-0.5 -top-0.5 h-4 min-w-4 items-center justify-center rounded-full px-1">
            <Text
              style={{ fontVariant: ['tabular-nums'] }}
              className="text-destructive-foreground font-mono text-2xs">
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Animated.View style={labelStyle}>
        <Text
          className={
            focused
              ? 'text-primary text-2xs font-medium'
              : 'text-muted-foreground text-2xs'
          }>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const mounted = useSharedValue(0);

  React.useEffect(() => {
    mounted.value = withTiming(1, { duration: 220 });
  }, [mounted]);

  const barStyle = useAnimatedStyle(() => ({
    opacity: mounted.value,
    transform: [{ translateY: (1 - mounted.value) * 12 }],
  }));

  return (
    <Animated.View
      style={[barStyle, { flexDirection: 'row', paddingBottom: Math.max(insets.bottom, 8) }]}
      className="border-border bg-sidebar flex-row border-t px-1 pt-1">
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
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
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
            badge={
              typeof options.tabBarBadge === 'number' ? options.tabBarBadge : undefined
            }
            onPress={onPress}
            onLongPress={onLongPress}
          />
        );
      })}
    </Animated.View>
  );
}
