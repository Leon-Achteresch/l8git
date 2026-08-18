import * as Haptics from 'expo-haptics';
import { Plus, Server, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { Alert as RNAlert, Pressable, View } from 'react-native';

import { AddHostDialog } from '~/components/connections/add-host-dialog';
import { HostDetailDialog } from '~/components/connections/host-detail-dialog';
import { statusLabel, statusTone } from '~/components/connections/status';
import { EmptyState } from '~/components/empty-state';
import { SectionHeader } from '~/components/section-header';
import { StatusDot } from '~/components/status-dot';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';
import { useConnections, type HostMeta } from '~/lib/connections';
import { cn } from '~/lib/utils';

export function HostsSection() {
  const hosts = useConnections((state) => state.hosts);
  const [adding, setAdding] = React.useState(false);
  const [detailHostId, setDetailHostId] = React.useState<string | null>(null);

  return (
    <View>
      <SectionHeader
        title="Hosts"
        count={hosts.length}
        action={
          <Button size="sm" variant="secondary" onPress={() => setAdding(true)}>
            <Icon as={Plus} className="text-foreground size-4" />
            <Text>Add host</Text>
          </Button>
        }
      />

      {hosts.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No hosts paired"
          description="Run `l8gitd pair` on your machine and scan the QR code to connect."
          action={
            <Button size="sm" onPress={() => setAdding(true)}>
              <Text>Add host</Text>
            </Button>
          }
        />
      ) : (
        <View className="overflow-hidden">
          {hosts.map((host, index) => (
            <HostCard
              key={host.hostId}
              host={host}
              first={index === 0}
              last={index === hosts.length - 1}
              onOpenDetail={() => setDetailHostId(host.hostId)}
            />
          ))}
        </View>
      )}

      <AddHostDialog open={adding} onOpenChange={setAdding} />
      <HostDetailDialog
        hostId={detailHostId}
        onOpenChange={(open) => setDetailHostId(open ? detailHostId : null)}
      />
    </View>
  );
}

function HostCard({
  host,
  first,
  last,
  onOpenDetail,
}: {
  host: HostMeta;
  first: boolean;
  last: boolean;
  onOpenDetail: () => void;
}) {
  const runtime = useConnections((state) => state.runtime[host.hostId]);
  const activeHostId = useConnections((state) => state.activeHostId);
  const connect = useConnections((state) => state.connect);
  const disconnect = useConnections((state) => state.disconnect);
  const forgetHost = useConnections((state) => state.forgetHost);
  const setActiveHost = useConnections((state) => state.setActiveHost);

  const status = runtime?.status ?? 'idle';
  const wantsConnection = status !== 'idle' && status !== 'error';

  const onToggle = (next: boolean) => {
    void Haptics.selectionAsync();
    if (next) {
      void connect(host.hostId);
      return;
    }
    disconnect(host.hostId);
  };

  const onForget = () => {
    RNAlert.alert(
      `Forget ${host.name}?`,
      'The pairing secret is deleted from this device. You will need to pair again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            void forgetHost(host.hostId);
          },
        },
      ]
    );
  };

  return (
    <Pressable
      onPress={onOpenDetail}
      onLongPress={() => setActiveHost(host.hostId)}
      className={cn(
        'border-border bg-card/60 active:bg-accent flex-row items-center gap-3 border-x border-b px-3 py-3',
        first && 'rounded-t-lg border-t',
        last && 'rounded-b-lg',
        activeHostId === host.hostId && 'border-l-primary border-l-2'
      )}>
      <StatusDot
        tone={statusTone(status)}
        pulse={status === 'connecting' || status === 'reconnecting'}
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-foreground text-base font-medium">
          {host.name}
        </Text>
        <Text numberOfLines={1} className="text-muted-foreground text-sm">
          {statusLabel(status, runtime?.latencyMs ?? null)}
          {' · '}
          {runtime?.endpoint ?? host.endpoints.join(', ')}
        </Text>
        {runtime?.lastError ? (
          <Text numberOfLines={1} className="text-destructive text-xs">
            {runtime.lastError}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Forget ${host.name}`}
        hitSlop={8}
        onPress={onForget}
        className="p-1">
        <Icon as={Trash2} className="text-muted-foreground size-4" />
      </Pressable>
      <Switch checked={wantsConnection} onCheckedChange={onToggle} />
    </Pressable>
  );
}
