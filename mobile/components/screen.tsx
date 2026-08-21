import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Image, ScrollView, View, type ViewProps } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '~/components/ui/text';
import { illustrations, type IllustrationName } from '~/lib/illustrations';
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
          contentContainerClassName={cn('gap-3 px-4 pb-16 pt-2', contentClassName)}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={edges} className={cn('bg-background flex-1', className)}>
      <View className={cn('flex-1 px-4 pt-2', contentClassName)} {...props}>
        {children}
      </View>
    </SafeAreaView>
  );
}

export function ScreenTitle({
  title,
  subtitle,
  right,
  illustration,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  icon?: LucideIcon;
  iconColor?: string;
  illustration?: IllustrationName;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 pb-3 pt-1">
      <View className="flex-1 flex-row items-center gap-3">
        {illustration ? (
          <Image
            source={illustrations[illustration]}
            resizeMode="cover"
            style={{ width: 44, height: 44, borderRadius: 14 }}
          />
        ) : null}
        <View className="flex-1 gap-0.5">
          <Text className="text-foreground text-3xl font-bold tracking-tight">{title}</Text>
          {subtitle ? <Text className="text-muted-foreground text-sm">{subtitle}</Text> : null}
        </View>
      </View>
      {right ? <View className="pl-1">{right}</View> : null}
    </View>
  );
}
