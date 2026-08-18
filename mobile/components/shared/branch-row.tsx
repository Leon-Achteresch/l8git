import { ArrowDown, ArrowUp, Check, Cloud, GitBranch } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { middleTruncate, relativeTime, shortHash } from '~/components/shared/format';
import { PressableRow } from '~/components/shared/pressable-row';
import { StatusPill } from '~/components/shared/status-pill';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

export type BranchRowProps = {
  name: string;
  current?: boolean;
  remote?: boolean;
  upstream?: string | null;
  gone?: boolean;
  ahead?: number | null;
  behind?: number | null;
  tip?: string | null;
  date?: string | null;
  subject?: string | null;
  selected?: boolean;
  first?: boolean;
  last?: boolean;
  flat?: boolean;
  trailing?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function BranchRow({
  name,
  current = false,
  remote = false,
  upstream,
  gone = false,
  ahead,
  behind,
  tip,
  date,
  subject,
  selected = false,
  first = false,
  last = false,
  flat = false,
  trailing,
  onPress,
  onLongPress,
}: BranchRowProps) {
  const meta = [subject, relativeTime(date)].filter(Boolean).join(' · ');

  return (
    <PressableRow
      first={first}
      last={last}
      flat={flat}
      selected={selected || current}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={current ? `Current branch ${name}` : `Branch ${name}`}>
      <View className="flex-row items-center gap-2.5 px-3 py-2.5">
        {current ? <View className="bg-git-branch absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-r" /> : null}

        <View
          className={cn(
            'h-7 w-7 items-center justify-center rounded-lg border',
            current
              ? 'border-git-branch/40 bg-git-branch/15'
              : remote
                ? 'border-border bg-muted/70'
                : 'border-border bg-muted/40'
          )}>
          <Icon
            as={remote ? Cloud : GitBranch}
            size={13}
            className={current ? 'text-git-branch' : 'text-muted-foreground'}
          />
        </View>

        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <Text
              numberOfLines={1}
              className={cn(
                'flex-1 text-sm font-medium',
                current ? 'text-git-branch' : 'text-foreground'
              )}>
              {middleTruncate(name, 40)}
            </Text>
            {current ? (
              <Icon as={Check} size={12} className="text-git-branch" />
            ) : null}
          </View>

          <View className="flex-row items-center gap-1.5">
            {tip ? (
              <Text className="text-git-hash font-mono text-2xs">{shortHash(tip)}</Text>
            ) : null}
            {meta ? (
              <Text numberOfLines={1} className="text-muted-foreground flex-1 text-xs">
                {meta}
              </Text>
            ) : upstream ? (
              <Text numberOfLines={1} className="text-muted-foreground flex-1 text-xs">
                {middleTruncate(upstream, 32)}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center gap-1">
          {gone ? <StatusPill label="gone" tone="danger" size="xs" /> : null}
          {ahead ? <StatusPill label={ahead} tone="added" size="xs" icon={ArrowUp} mono /> : null}
          {behind ? (
            <StatusPill label={behind} tone="removed" size="xs" icon={ArrowDown} mono />
          ) : null}
          {trailing}
        </View>
      </View>
    </PressableRow>
  );
}
