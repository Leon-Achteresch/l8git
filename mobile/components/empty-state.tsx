import { Bot, ChartNoAxesColumn, FolderGit2, Inbox, Server, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Glass } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import type { IllustrationName } from '~/lib/illustrations';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

type EmptyStateProps = {
  icon?: LucideIcon;
  iconColor?: string;
  illustration?: IllustrationName;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

const ILLUSTRATION_ICON: Record<IllustrationName, LucideIcon> = {
  repo: FolderGit2,
  agent: Bot,
  inbox: Inbox,
  dashboard: ChartNoAxesColumn,
  host: Server,
};

export function EmptyState({
  icon,
  iconColor = palette.foreground,
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const resolved = icon ?? (illustration ? ILLUSTRATION_ICON[illustration] : undefined);
  return (
    <View className={cn('items-center justify-center gap-5 px-8 py-12', className)}>
      {resolved ? (
        <Glass
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon as={resolved} size={28} color={iconColor} />
        </Glass>
      ) : null}
      <View className="items-center gap-1.5">
        <Text className="text-foreground text-center text-xl font-bold tracking-tight">{title}</Text>
        {description ? (
          <Text className="text-muted-foreground max-w-72 text-center text-sm leading-5">
            {description}
          </Text>
        ) : null}
      </View>
      {action ? <View className="items-center pt-1">{action}</View> : null}
    </View>
  );
}
