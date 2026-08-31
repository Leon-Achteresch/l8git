import { BlurView, type BlurViewProps } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

export const glassSurface: ViewStyle = {
  overflow: 'hidden',
  backgroundColor: 'rgba(255,255,255,0.10)',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.18)',
};

export function Glass({ style, intensity = 42, children, ...props }: BlurViewProps) {
  return (
    <BlurView
      intensity={intensity}
      tint="dark"
      blurMethod="dimezisBlurView"
      style={[glassSurface, style]}
      {...props}>
      {children}
    </BlurView>
  );
}

type PressStyle = StyleProp<ViewStyle>;

export function GlassCircle({
  icon,
  label,
  size = 44,
  badge,
  color = palette.foreground,
  onPress,
  style,
}: {
  icon: LucideIcon;
  label: string;
  size?: number;
  badge?: number;
  color?: string;
  onPress?: () => void;
  style?: PressStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }, style]}>
      <Glass
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon as={icon} size={Math.round(size * 0.4)} color={color} strokeWidth={1.7} />
      </Glass>
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 19,
            height: 19,
            borderRadius: 10,
            paddingHorizontal: 5,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.destructive,
            borderWidth: 2,
            borderColor: palette.background,
          }}>
          <Text style={{ fontVariant: ['tabular-nums'] }} className="text-2xs font-bold text-white">
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function GlassPill({
  icon,
  label,
  onPress,
  style,
}: {
  icon?: LucideIcon;
  label: string;
  onPress?: () => void;
  style?: PressStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.72 : 1 }, style]}>
      <Glass
        style={{
          height: 40,
          borderRadius: 20,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
        {icon ? <Icon as={icon} size={14} color={palette.foreground} strokeWidth={1.7} /> : null}
        <Text numberOfLines={1} className="text-foreground text-sm font-semibold">
          {label}
        </Text>
      </Glass>
    </Pressable>
  );
}

export function SolidPill({
  icon,
  label,
  onPress,
  disabled,
  style,
}: {
  icon?: LucideIcon;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: PressStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: 48,
          borderRadius: 24,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: palette.primary,
          opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}>
      {icon ? <Icon as={icon} size={16} color={palette.primaryForeground} strokeWidth={2} /> : null}
      <Text className="text-primary-foreground text-base font-semibold">{label}</Text>
    </Pressable>
  );
}

export function Fade({
  height = 160,
  top = false,
  color = palette.background,
  style,
}: {
  height?: number;
  top?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={top ? [color, 'transparent'] : ['transparent', color]}
      style={[
        { position: 'absolute', left: 0, right: 0, height },
        top ? { top: 0 } : { bottom: 0 },
        style,
      ]}
    />
  );
}
