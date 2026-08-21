import {
  ArrowRight,
  CircleCheck,
  CircleX,
  GitPullRequest,
  LoaderCircle,
  Users,
} from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { InboxRowFrame, MetaDot } from '~/components/inbox/inbox-row';
import { middleTruncate } from '~/components/shared/format';
import { HostBadge } from '~/components/shared/host-badge';
import { StatusPill, type PillTone } from '~/components/shared/status-pill';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import type { InboxCheckState, InboxPrItem } from '~/lib/inbox';
import { palette } from '~/lib/theme';

const CHECK_TONE: Record<InboxCheckState, PillTone> = {
  success: 'added',
  failure: 'removed',
  running: 'info',
  unknown: 'neutral',
};

const CHECK_ICON = {
  success: CircleCheck,
  failure: CircleX,
  running: LoaderCircle,
  unknown: LoaderCircle,
} as const;

const CHECK_LABEL: Record<InboxCheckState, string> = {
  success: 'checks passed',
  failure: 'checks failed',
  running: 'checks running',
  unknown: '',
};

export const InboxPrRow = React.memo(function InboxPrRow({
  item,
  showHost = false,
  divider = false,
  iconColor = palette.mutedForeground,
  onOpen,
}: {
  item: InboxPrItem;
  showHost?: boolean;
  divider?: boolean;
  iconColor?: string;
  onOpen: (item: InboxPrItem) => void;
}) {
  const handlePress = React.useCallback(() => onOpen(item), [item, onOpen]);

  return (
    <InboxRowFrame
      repoName={item.repoName}
      title={item.title}
      updatedAt={item.updatedAt}
      icon={GitPullRequest}
      iconColor={iconColor}
      externalUrl={item.htmlUrl || null}
      divider={divider}
      accessibilityLabel={`Pull request ${item.number} in ${item.repoName}: ${item.title}`}
      onPress={handlePress}
      meta={
        <>
          <Text className="text-muted-foreground font-mono text-2xs">#{item.number}</Text>
          <MetaDot />
          <Text numberOfLines={1} className="text-muted-foreground max-w-28 text-2xs">
            {item.author}
          </Text>
          <MetaDot />
          <View className="min-w-0 flex-row items-center gap-1">
            <Text numberOfLines={1} className="text-foreground/90 max-w-28 text-2xs">
              {middleTruncate(item.sourceBranch, 22)}
            </Text>
            <Icon as={ArrowRight} size={9} className="text-muted-foreground/60" />
            <Text numberOfLines={1} className="text-muted-foreground max-w-24 text-2xs">
              {middleTruncate(item.targetBranch, 18)}
            </Text>
          </View>
        </>
      }
      badges={
        <>
          {item.isDraft ? <StatusPill label="Draft" tone="neutral" size="xs" /> : null}
          {item.checks !== 'unknown' ? (
            <StatusPill
              label={CHECK_LABEL[item.checks]}
              tone={CHECK_TONE[item.checks]}
              icon={CHECK_ICON[item.checks]}
              size="xs"
            />
          ) : null}
          {item.reviewers.length > 0 ? (
            <StatusPill
              label={item.reviewers.length}
              tone="neutral"
              icon={Users}
              size="xs"
              mono
            />
          ) : null}
          {showHost ? <HostBadge hostId={item.hostId} size="xs" /> : null}
        </>
      }
    />
  );
});
