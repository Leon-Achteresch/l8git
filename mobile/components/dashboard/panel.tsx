import { RotateCw, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('bg-card/70 gap-3 rounded-2xl px-4 py-4 shadow-none', className)}>
      {children}
    </Card>
  );
}

export function PanelHeader({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-start justify-between gap-3">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
          {title}
        </Text>
        {hint ? (
          <Text numberOfLines={1} className="text-muted-foreground/70 text-xs">
            {hint}
          </Text>
        ) : null}
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
    <View className="gap-0.5">
      <Text
        className={cn(
          'font-mono text-3xl leading-none tracking-tight',
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
