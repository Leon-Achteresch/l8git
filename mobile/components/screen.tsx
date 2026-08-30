import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View, type ViewProps } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

type ScreenProps = ViewProps & {
  scroll?: boolean;
  edges?: readonly Edge[];
  contentClassName?: string;
};

export function Screen({
  children,
  className,
  contentClassName,
  scroll = false,
  edges = ['top'],
  ...props
}: ScreenProps) {
  if (scroll) {
    return (
      <SafeAreaView edges={edges} className={cn('bg-background flex-1', className)}>
        <ScrollView
          contentContainerClassName={cn('gap-4 px-5 pb-36 pt-2', contentClassName)}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={edges} className={cn('bg-background flex-1', className)}>
      <View className={cn('flex-1 px-5 pt-2', contentClassName)} {...props}>
        {children}
      </View>
    </SafeAreaView>
  );
}

export function ScreenTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  icon?: LucideIcon;
  iconColor?: string;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 pb-5 pt-1">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-foreground text-[32px] font-bold tracking-tight">{title}</Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-muted-foreground text-sm">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View className="flex-row items-center gap-3">{right}</View> : null}
    </View>
  );
}
