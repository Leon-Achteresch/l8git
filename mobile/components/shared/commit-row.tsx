import { GitMerge, Tag } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { accentFor, initials, relativeTime, shortHash } from '~/components/shared/format';
import { PressableRow } from '~/components/shared/pressable-row';
import { StatusPill } from '~/components/shared/status-pill';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

export type CommitRowProps = {
  hash: string;
  subject: string;
  author: string;
  email?: string | null;
  avatarUrl?: string | null;
  date?: string | null;
  tags?: readonly string[];
  parents?: readonly string[];
  laneColor?: string;
  graph?: boolean;
  connectTop?: boolean;
  connectBottom?: boolean;
  selected?: boolean;
  first?: boolean;
  last?: boolean;
  trailing?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function CommitRow({
  hash,
  subject,
  author,
  email,
  avatarUrl,
  date,
  tags,
  parents,
  laneColor,
  graph = true,
  connectTop = true,
  connectBottom = true,
  selected = false,
  first = false,
  last = false,
  trailing,
  onPress,
  onLongPress,
}: CommitRowProps) {
  const merge = (parents?.length ?? 0) > 1;
  const dotColor = laneColor ?? accentFor(hash);
  const avatarTint = accentFor(email ?? author);
  const meta = [author, relativeTime(date)].filter(Boolean).join(' · ');

  return (
    <PressableRow
      first={first}
      last={last}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={`Commit ${shortHash(hash)}: ${subject}`}>
      <View className="flex-row items-center gap-3 px-3 py-2.5">
        {graph ? (
          <View className="w-3 items-center self-stretch">
            <View
              className={cn('w-px flex-1', connectTop ? 'bg-border' : 'bg-transparent')}
            />
            <View
              style={{ backgroundColor: dotColor, borderColor: palette.background }}
              className="h-2.5 w-2.5 rounded-full border-2"
            />
            <View
              className={cn('w-px flex-1', connectBottom ? 'bg-border' : 'bg-transparent')}
            />
          </View>
        ) : null}

        <Avatar alt={author} className="size-8">
          {avatarUrl ? <AvatarImage source={{ uri: avatarUrl }} /> : null}
          <AvatarFallback style={{ backgroundColor: `${avatarTint}26` }}>
            <Text style={{ color: avatarTint }} className="text-2xs font-semibold">
              {initials(author)}
            </Text>
          </AvatarFallback>
        </Avatar>

        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-1.5">
            {merge ? <Icon as={GitMerge} size={12} className="text-git-merge" /> : null}
            <Text numberOfLines={1} className="text-foreground flex-1 text-sm font-medium">
              {subject}
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Text className="text-git-hash font-mono text-2xs">{shortHash(hash)}</Text>
            <Text numberOfLines={1} className="text-muted-foreground flex-1 text-xs">
              {meta}
            </Text>
          </View>
          {tags && tags.length > 0 ? (
            <View className="flex-row flex-wrap items-center gap-1 pt-0.5">
              {tags.slice(0, 3).map((tag) => (
                <StatusPill key={tag} label={tag} tone="warning" size="xs" icon={Tag} />
              ))}
              {tags.length > 3 ? (
                <StatusPill label={`+${tags.length - 3}`} tone="neutral" size="xs" mono />
              ) : null}
            </View>
          ) : null}
        </View>

        {trailing}
      </View>
    </PressableRow>
  );
}
