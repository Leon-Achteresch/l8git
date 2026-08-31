import { Bot } from 'lucide-react-native';
import * as React from 'react';

import { InboxRowFrame } from '~/components/inbox/inbox-row';
import { HostBadge } from '~/components/shared/host-badge';
import type { InboxAgentItem } from '~/components/inbox/use-inbox';
import { palette } from '~/lib/theme';

export function InboxAgentRow({
  item,
  showHost = false,
  divider = false,
  onOpen,
}: {
  item: InboxAgentItem;
  showHost?: boolean;
  divider?: boolean;
  onOpen: (item: InboxAgentItem) => void;
}) {
  return (
    <InboxRowFrame
      repoName={item.repoName}
      title={item.title}
      updatedAt={item.updatedAt}
      icon={Bot}
      iconColor={palette.warning}
      divider={divider}
      meta={showHost ? <HostBadge hostId={item.hostId} size="xs" /> : undefined}
      onPress={() => onOpen(item)}
    />
  );
}
