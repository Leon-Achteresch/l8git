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

import { Icon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';
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
            className="flex-1 bg-black/65"
          />
        </Animated.View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            entering={SlideInDown.duration(260).springify().damping(22)}
            exiting={SlideOutDown.duration(180)}
            style={{ paddingBottom: insets.bottom + 12 }}
            className="border-border bg-background rounded-t-3xl border-x border-t px-4 pt-2.5">
            <View className="bg-border mb-3 h-1 w-9 self-center rounded-full" />

            <View className="gap-1 pb-3">
              <Text className="text-foreground text-lg font-semibold tracking-tight">{title}</Text>
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
        'border-border bg-card/60 active:bg-accent flex-row items-center gap-3 rounded-xl border px-3 py-3',
        disabled && 'opacity-45'
      )}>
      <View
        className={cn(
          'h-8 w-8 items-center justify-center rounded-lg border',
          tone === 'danger'
            ? 'border-destructive/30 bg-destructive/12'
            : tone === 'accent'
              ? 'border-git-branch/30 bg-git-branch/12'
              : 'border-border bg-muted/60'
        )}>
        <Icon
          as={icon}
          size={15}
          className={
            tone === 'danger'
              ? 'text-destructive'
              : tone === 'accent'
                ? 'text-git-branch'
                : 'text-foreground'
          }
        />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className={cn(
            'text-sm font-medium',
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
        'flex-row items-start gap-3 rounded-xl border px-3 py-2.5',
        selected
          ? danger
            ? 'border-destructive/45 bg-destructive/10'
            : 'border-foreground/25 bg-accent/60'
          : 'border-border bg-card/40 active:bg-accent/40'
      )}>
      <View
        className={cn(
          'mt-0.5 h-4 w-4 items-center justify-center rounded-full border',
          selected
            ? danger
              ? 'border-destructive'
              : 'border-foreground'
            : 'border-muted-foreground/50'
        )}>
        {selected ? (
          <View className={cn('h-2 w-2 rounded-full', danger ? 'bg-destructive' : 'bg-foreground')} />
        ) : null}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className={cn(
            'text-sm font-medium',
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
    <View className="gap-1.5 py-1">
      <Text className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
        {label}
      </Text>
      {children}
      {hint ? <Text className="text-muted-foreground/80 text-2xs">{hint}</Text> : null}
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
      autoFocus={autoFocus}
      multiline={multiline}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      className={cn('text-sm', multiline && 'h-20 py-2')}
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
      className="border-border bg-card/40 flex-row items-center gap-3 rounded-xl border px-3 py-2.5">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-foreground text-sm font-medium">{label}</Text>
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
        'rounded-xl border px-3 py-2.5',
        tone === 'danger' ? 'border-destructive/30 bg-destructive/8' : 'border-border bg-muted/40'
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
