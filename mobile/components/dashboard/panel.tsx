import { RotateCw, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { GlassPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('bg-card gap-3 rounded-[28px] px-5 py-5', className)}>{children}</View>
  );
}

export function PanelHeader({
  title,
  hint,
  icon,
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
      <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
        {icon ? (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.08)',
            }}>
            <Icon as={icon} size={15} color={palette.foreground} />
          </View>
        ) : null}
        <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
          <Text className="text-foreground text-base font-semibold">{title}</Text>
          {hint ? (
            <Text numberOfLines={1} className="text-muted-foreground shrink text-sm">
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
      {onRetry ? <GlassPill icon={RotateCw} label="Retry" onPress={onRetry} /> : null}
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
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.06)',
        }}>
        <Icon as={icon} size={16} color={palette.mutedForeground} />
      </View>
      <Text className="text-muted-foreground max-w-64 text-center text-xs">{message}</Text>
    </View>
  );
}

export function PanelSkeleton({ height = 120 }: { height?: number }) {
  return (
    <View className="gap-2" style={{ height }}>
      <Skeleton className="h-full w-full rounded-3xl opacity-60" />
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
