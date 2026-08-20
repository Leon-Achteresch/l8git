import { RotateCw, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { IconBadge } from '~/components/shared/icon-badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.25,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 6,
} as const;

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      style={CARD_SHADOW}
      className={cn('border-border bg-card gap-3 rounded-3xl border px-5 py-5', className)}>
      {children}
    </Card>
  );
}

export function PanelHeader({
  title,
  hint,
  icon,
  iconColor = palette.cat.green,
  right,
}: {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  iconColor?: string;
  right?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        {icon ? <IconBadge icon={icon} color={iconColor} size="sm" /> : null}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-base font-semibold tracking-tight">{title}</Text>
          {hint ? (
            <Text numberOfLines={1} className="text-muted-foreground text-xs">
              {hint}
            </Text>
          ) : null}
        </View>
      </View>
      {right}
    </View>
  );
}

export function PanelValue({
  value,
  label,
  tone = 'default',
}: {
  value: string;
  label: string;
  tone?: 'default' | 'muted';
}) {
  return (
    <View className="gap-1">
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className={cn(
          'text-5xl font-bold leading-none tracking-tight',
          tone === 'muted' ? 'text-muted-foreground' : 'text-foreground'
        )}>
        {value}
      </Text>
      <Text numberOfLines={1} className="text-muted-foreground text-xs">
        {label}
      </Text>
    </View>
  );
}

export function PanelError({
  message = 'Could not load this data.',
  onRetry,
  height,
}: {
  message?: string;
  onRetry?: () => void;
  height?: number;
}) {
  return (
    <View className="items-center justify-center gap-3 py-4" style={height ? { height } : null}>
      <Text className="text-muted-foreground max-w-64 text-center text-xs">{message}</Text>
      {onRetry ? (
        <Button size="sm" variant="outline" onPress={onRetry} className="h-8 rounded-lg px-3">
          <Icon as={RotateCw} className="text-foreground size-3.5" />
          <Text className="text-xs">Retry</Text>
        </Button>
      ) : null}
    </View>
  );
}

export function PanelEmpty({
  icon,
  message,
  height,
}: {
  icon: LucideIcon;
  message: string;
  height?: number;
}) {
  return (
    <View className="items-center justify-center gap-2 py-6" style={height ? { height } : null}>
      <View className="border-border bg-muted/60 h-9 w-9 items-center justify-center rounded-full border">
        <Icon as={icon} className="text-muted-foreground size-4" />
      </View>
      <Text className="text-muted-foreground max-w-64 text-center text-xs">{message}</Text>
    </View>
  );
}

export function PanelSkeleton({ height = 120 }: { height?: number }) {
  return (
    <View className="gap-2" style={{ height }}>
      <Skeleton className="h-full w-full rounded-lg opacity-60" />
    </View>
  );
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View style={{ backgroundColor: color }} className="h-1.5 w-1.5 rounded-full" />
      <Text className="text-muted-foreground text-xs">{label}</Text>
    </View>
  );
}
