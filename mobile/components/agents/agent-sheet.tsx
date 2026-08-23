import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

export function AgentSheet({
  visible,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string | null;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(140)}
          className="absolute bottom-0 left-0 right-0 top-0">
          <Pressable accessibilityLabel="Close" onPress={onClose} className="flex-1 bg-black/70" />
        </Animated.View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            entering={SlideInDown.duration(260).springify().damping(22)}
            exiting={SlideOutDown.duration(180)}
            style={{ paddingBottom: insets.bottom + 14 }}
            className="bg-card rounded-t-[28px] px-5 pt-3">
            <View className="bg-white/15 mb-4 h-1 w-10 self-center rounded-full" />

            <View className="gap-1 pb-4">
              <Text className="text-foreground text-2xl font-bold tracking-tight">{title}</Text>
              {description ? (
                <Text className="text-muted-foreground text-sm">{description}</Text>
              ) : null}
            </View>

            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerClassName="gap-2 pb-2"
              className="max-h-[62vh]">
              {children}
            </ScrollView>

            {footer ? <View className="gap-2 pt-3">{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function SheetOption({
  label,
  description,
  selected,
  danger = false,
  onPress,
}: {
  label: string;
  description?: string;
  selected: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'flex-row items-start gap-3 rounded-2xl px-4 py-3',
        selected
          ? danger
            ? 'bg-destructive/12'
            : 'bg-white/10'
          : 'bg-white/[0.04] active:bg-white/[0.08]'
      )}>
      <View
        className={cn(
          'mt-0.5 h-5 w-5 items-center justify-center rounded-full',
          selected ? (danger ? 'bg-destructive' : 'bg-foreground') : 'bg-white/10'
        )}>
        {selected ? (
          <View
            className={cn('h-2 w-2 rounded-full', danger ? 'bg-white' : 'bg-background')}
          />
        ) : null}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className={cn(
            'text-sm font-semibold',
            selected && danger ? 'text-destructive' : 'text-foreground'
          )}>
          {label}
        </Text>
        {description ? (
          <Text className="text-muted-foreground text-xs leading-4">{description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function SheetChip({
  label,
  active,
  danger = false,
  onPress,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const shape: ViewStyle = {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const inner = (
    <Text
      className={
        active
          ? danger
            ? 'text-sm font-semibold text-white'
            : 'text-primary-foreground text-sm font-semibold'
          : 'text-foreground text-sm font-medium'
      }>
      {label}
    </Text>
  );
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {active ? (
        <View
          style={[shape, { backgroundColor: danger ? palette.destructive : palette.primary }]}>
          {inner}
        </View>
      ) : (
        <Glass style={shape}>{inner}</Glass>
      )}
    </Pressable>
  );
}

export function SheetSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2 py-1">
      <Text className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
        {label}
      </Text>
      {children}
      {hint ? <Text className="text-muted-foreground/80 text-2xs">{hint}</Text> : null}
    </View>
  );
}

export function SheetMessage({
  tone = 'muted',
  children,
}: {
  tone?: 'muted' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <View
      className={cn(
        'rounded-2xl px-4 py-3',
        tone === 'danger' ? 'bg-destructive/12' : 'bg-white/[0.05]'
      )}>
      <Text
        className={cn(
          'text-xs leading-4',
          tone === 'danger' ? 'text-destructive' : 'text-muted-foreground'
        )}>
        {children}
      </Text>
    </View>
  );
}

export function SheetTextInput({
  value,
  onChangeText,
  placeholder,
  autoFocus = false,
  multiline = false,
  autoCapitalize = 'none',
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <Input
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      autoFocus={autoFocus}
      multiline={multiline}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      className={cn('bg-white/[0.06] text-sm', multiline && 'h-20 py-2')}
    />
  );
}

export function SoftPill({
  icon,
  label,
  tone = 'default',
  disabled,
  onPress,
  style,
}: {
  icon?: LucideIcon;
  label: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const color = tone === 'danger' ? palette.destructive : palette.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }, style]}>
      <Glass
        style={{
          height: 54,
          borderRadius: 27,
          paddingHorizontal: 22,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}>
        {icon ? <Icon as={icon} size={17} color={color} /> : null}
        <Text numberOfLines={1} style={{ color }} className="text-base font-semibold">
          {label}
        </Text>
      </Glass>
    </Pressable>
  );
}
