import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SolidPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

export function Sheet({
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
          <Pressable
            accessibilityLabel="Close"
            onPress={onClose}
            className="flex-1 bg-black/70"
          />
        </Animated.View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            entering={SlideInDown.duration(260).springify().damping(22)}
            exiting={SlideOutDown.duration(180)}
            style={{ paddingBottom: insets.bottom + 14 }}
            className="bg-card rounded-t-[28px] px-5 pt-3">
            <View className="bg-white/15 mb-4 h-1 w-9 self-center rounded-full" />

            <View className="gap-1 pb-4">
              <Text numberOfLines={2} className="text-foreground text-xl font-bold tracking-tight">
                {title}
              </Text>
              {description ? (
                <Text numberOfLines={2} className="text-muted-foreground text-sm">
                  {description}
                </Text>
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

            {footer ? <View className="gap-2 pt-4">{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function SheetPrimary({
  label,
  onPress,
  disabled = false,
  destructive = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: LucideIcon;
}) {
  if (destructive) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        className={cn(
          'bg-destructive/15 active:bg-destructive/25 h-[54px] flex-1 flex-row items-center justify-center gap-2 rounded-full px-5',
          disabled && 'opacity-50'
        )}>
        {icon ? <Icon as={icon} size={17} color={palette.destructive} /> : null}
        <Text className="text-destructive text-base font-semibold">{label}</Text>
      </Pressable>
    );
  }
  return (
    <SolidPill icon={icon} label={label} disabled={disabled} onPress={onPress} style={{ flex: 1 }} />
  );
}

export function SheetSecondary({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'bg-white/10 active:bg-white/15 h-[54px] flex-1 flex-row items-center justify-center rounded-full px-5',
        disabled && 'opacity-50'
      )}>
      <Text className="text-foreground text-base font-semibold">{label}</Text>
    </Pressable>
  );
}

export function SheetAction({
  icon,
  label,
  description,
  tone = 'default',
  disabled = false,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  tone?: 'default' | 'danger' | 'accent';
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'active:bg-white/5 flex-row items-center gap-3.5 rounded-3xl px-2 py-2.5',
        disabled && 'opacity-45'
      )}>
      <View
        className={cn(
          'h-11 w-11 items-center justify-center rounded-full',
          tone === 'danger'
            ? 'bg-destructive/15'
            : tone === 'accent'
              ? 'bg-primary'
              : 'bg-white/10'
        )}>
        <Icon
          as={icon}
          size={18}
          color={
            tone === 'danger'
              ? palette.destructive
              : tone === 'accent'
                ? palette.primaryForeground
                : palette.foreground
          }
        />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className={cn(
            'text-base font-semibold',
            tone === 'danger' ? 'text-destructive' : 'text-foreground'
          )}>
          {label}
        </Text>
        {description ? (
          <Text numberOfLines={2} className="text-muted-foreground text-xs">
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function OptionRow({
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
        'flex-row items-start gap-3 rounded-3xl px-4 py-3',
        selected ? (danger ? 'bg-destructive/15' : 'bg-white/10') : 'active:bg-white/5'
      )}>
      <View
        className={cn(
          'mt-0.5 h-[18px] w-[18px] items-center justify-center rounded-full border-2',
          selected
            ? danger
              ? 'border-destructive'
              : 'border-foreground'
            : 'border-white/20'
        )}>
        {selected ? (
          <View className={cn('h-2 w-2 rounded-full', danger ? 'bg-destructive' : 'bg-foreground')} />
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

export function SheetField({
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
      <Text className="text-muted-foreground px-1 text-xs font-medium uppercase tracking-widest">
        {label}
      </Text>
      {children}
      {hint ? <Text className="text-muted-foreground/80 px-1 text-2xs">{hint}</Text> : null}
    </View>
  );
}

export function SheetInput({
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
      placeholderTextColor={palette.mutedForeground}
      autoFocus={autoFocus}
      multiline={multiline}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      textAlignVertical={multiline ? 'top' : 'center'}
      className={cn(
        'bg-white/10 border-0 px-4 text-sm shadow-none',
        multiline ? 'h-24 rounded-3xl py-3' : 'h-12 rounded-full'
      )}
    />
  );
}

export function SheetToggle({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      onPress={() => onCheckedChange(!checked)}
      className="bg-white/5 active:bg-white/10 flex-row items-center gap-3 rounded-3xl px-4 py-3">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-foreground text-sm font-semibold">{label}</Text>
        {description ? (
          <Text className="text-muted-foreground text-xs leading-4">{description}</Text>
        ) : null}
      </View>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </Pressable>
  );
}

export function SheetNote({
  tone = 'muted',
  children,
}: {
  tone?: 'muted' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <View
      className={cn(
        'rounded-3xl px-4 py-3',
        tone === 'danger' ? 'bg-destructive/10' : 'bg-white/5'
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
