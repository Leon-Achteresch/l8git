import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

type ListRowProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  icon?: LucideIcon;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  chevron?: boolean;
  first?: boolean;
  last?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  className?: string;
};

export function ListRow({
  title,
  subtitle,
  meta,
  icon,
  leading,
  trailing,
  chevron = false,
  first = false,
  last = false,
  disabled = false,
  onPress,
  className,
}: ListRowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={disabled || !onPress}
      onPress={onPress}
      className={cn(
        'border-border bg-card/60 flex-row items-center gap-3 border-x border-b px-3 py-3',
        first && 'rounded-t-lg border-t',
        last && 'rounded-b-lg',
        onPress && 'active:bg-accent',
        disabled && 'opacity-50',
        className
      )}>
      {leading ?? (icon ? <Icon as={icon} className="text-muted-foreground size-4" /> : null)}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-foreground text-base font-medium">
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-muted-foreground text-sm">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className="text-muted-foreground font-mono text-xs">
          {meta}
        </Text>
      ) : null}
      {trailing}
      {chevron ? <Icon as={ChevronRight} className="text-muted-foreground size-4" /> : null}
    </Pressable>
  );
}

export function ListGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const items = React.Children.toArray(children);
  return (
    <View className={cn('overflow-hidden', className)}>
      {items.map((child, index) =>
        React.isValidElement<ListRowProps>(child)
          ? React.cloneElement(child, {
              first: index === 0,
              last: index === items.length - 1,
            })
          : child
      )}
    </View>
  );
}
