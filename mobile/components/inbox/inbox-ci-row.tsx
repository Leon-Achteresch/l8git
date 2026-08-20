import { GitBranch, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';

import { InboxRowFrame, MetaDot } from '~/components/inbox/inbox-row';
import { middleTruncate } from '~/components/shared/format';
import { HostBadge } from '~/components/shared/host-badge';
import { StatusPill } from '~/components/shared/status-pill';
import { Text } from '~/components/ui/text';
import type { InboxCiItem } from '~/lib/inbox';
import { palette } from '~/lib/theme';

const CONCLUSION_LABEL: Record<string, string> = {
  failure: 'failed',
  timed_out: 'timed out',
  startup_failure: 'startup failed',
  action_required: 'action required',
};

export const InboxCiRow = React.memo(function InboxCiRow({
  item,
  showHost = false,
  divider = false,
  onOpen,
}: {
  item: InboxCiItem;
  showHost?: boolean;
  divider?: boolean;
  onOpen: (item: InboxCiItem) => void;
}) {
  const handlePress = React.useCallback(() => onOpen(item), [item, onOpen]);

  return (
    <InboxRowFrame
      repoName={item.repoName}
      title={item.name}
      updatedAt={item.updatedAt}
      icon={TriangleAlert}
      iconColor={palette.destructive}
      externalUrl={item.htmlUrl || null}
      divider={divider}
      accessibilityLabel={`Failing workflow ${item.name} in ${item.repoName}`}
      onPress={handlePress}
      meta={
        <>
          <StatusPill
            label={middleTruncate(item.branch, 22)}
            tone="branch"
            icon={GitBranch}
            size="xs"
          />
          <Text className="text-muted-foreground font-mono text-2xs">#{item.runNumber}</Text>
          <MetaDot />
          <Text numberOfLines={1} className="text-muted-foreground max-w-28 text-2xs">
            {item.event}
          </Text>
        </>
      }
      badges={
        <>
          <StatusPill
            label={CONCLUSION_LABEL[item.conclusion] ?? item.conclusion}
            tone="danger"
            icon={TriangleAlert}
            size="xs"
          />
          {showHost ? <HostBadge hostId={item.hostId} size="xs" /> : null}
        </>
      }
    />
  );
});
