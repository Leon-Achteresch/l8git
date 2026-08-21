import * as Haptics from 'expo-haptics';
import { Plus, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { Alert as RNAlert, Image, Pressable, View } from 'react-native';

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
import { illustrations } from '~/lib/illustrations';
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add host"
            onPress={() => setAdding(true)}
            className="bg-primary active:opacity-80 flex-row items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-3.5">
            <Icon as={Plus} className="text-primary-foreground size-4" />
            <Text className="text-primary-foreground text-sm font-semibold">Add host</Text>
          </Pressable>
        }
      />

      {hosts.length === 0 ? (
        <EmptyState
          illustration="host"
          title="No hosts paired"
          description="Run `l8gitd pair` on your machine and scan the QR code to connect."
          action={
            <Button size="sm" onPress={() => setAdding(true)}>
              <Text>Add host</Text>
            </Button>
          }
        />
      ) : (
        <View className="gap-3">
          {hosts.map((host) => (
            <HostCard
              key={host.hostId}
              host={host}
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

function HostCard({ host, onOpenDetail }: { host: HostMeta; onOpenDetail: () => void }) {
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
      style={{
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      }}
      className={cn(
        'bg-card active:bg-elevated flex-row items-center gap-3 rounded-3xl p-4',
        activeHostId === host.hostId && 'border-primary border'
      )}>
      <View className="relative">
        <Image
          source={illustrations.host}
          resizeMode="cover"
          style={{ width: 52, height: 52, borderRadius: 16 }}
        />
        <View className="border-card absolute -bottom-0.5 -right-0.5 rounded-full border-2">
          <StatusDot
            tone={statusTone(status)}
            size="lg"
            pulse={status === 'connecting' || status === 'reconnecting'}
          />
        </View>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-foreground text-base font-semibold">
          {host.name}
        </Text>
        <Text
          numberOfLines={1}
          className="text-muted-foreground text-sm"
          style={{ fontVariant: ['tabular-nums'] }}>
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
        className="active:bg-accent h-8 w-8 items-center justify-center rounded-full">
        <Icon as={Trash2} className="text-muted-foreground size-4" />
      </Pressable>
      <Switch checked={wantsConnection} onCheckedChange={onToggle} />
    </Pressable>
  );
}
