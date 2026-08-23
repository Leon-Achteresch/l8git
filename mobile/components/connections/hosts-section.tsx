import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, Radio, Star, Trash2, Unplug } from 'lucide-react-native';
import * as React from 'react';
import { Alert as RNAlert, Pressable, View } from 'react-native';

import { AddHostDialog } from '~/components/connections/add-host-dialog';
import { HostDetailDialog } from '~/components/connections/host-detail-dialog';
import { statusLabel } from '~/components/connections/status';
import { EmptyState } from '~/components/empty-state';
import { initials } from '~/components/shared/format';
import { GlassPill, SolidPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';
import { useConnections, type HostMeta, type HostStatus } from '~/lib/connections';
import { palette } from '~/lib/theme';

const HOST_GRADIENTS: [string, string][] = [
  ['#ff6b57', '#bf5af2'],
  ['#0a84ff', '#40c8e0'],
  ['#34c759', '#ffd60a'],
  ['#ff2d92', '#ff9f0a'],
];

function ringColor(status: HostStatus): string {
  if (status === 'online') {
    return palette.success;
  }
  if (status === 'connecting' || status === 'reconnecting') {
    return palette.warning;
  }
  if (status === 'error') {
    return palette.destructive;
  }
  return 'rgba(255,255,255,0.18)';
}

export function HostsSection() {
  const hosts = useConnections((state) => state.hosts);
  const [adding, setAdding] = React.useState(false);
  const [detailHostId, setDetailHostId] = React.useState<string | null>(null);

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between pt-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-foreground text-base font-semibold">Hosts</Text>
          {hosts.length > 0 ? (
            <Text style={{ fontVariant: ['tabular-nums'] }} className="text-muted-foreground text-sm">
              {hosts.length}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add host"
          onPress={() => setAdding(true)}
          className="bg-primary active:opacity-80 h-9 flex-row items-center gap-1.5 rounded-full pl-3 pr-4">
          <Icon as={Plus} size={15} color={palette.primaryForeground} />
          <Text className="text-primary-foreground text-sm font-semibold">Add host</Text>
        </Pressable>
      </View>

      {hosts.length === 0 ? (
        <View className="bg-card rounded-[28px]">
          <EmptyState
            illustration="host"
            title="No hosts paired"
            description="Run `l8gitd pair` on your machine and scan the QR code to connect."
            action={<SolidPill icon={Plus} label="Add host" onPress={() => setAdding(true)} />}
          />
        </View>
      ) : (
        <View className="gap-3">
          {hosts.map((host, index) => (
            <HostCard
              key={host.hostId}
              host={host}
              index={index}
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
  index,
  onOpenDetail,
}: {
  host: HostMeta;
  index: number;
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
  const active = activeHostId === host.hostId;

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
      accessibilityRole="button"
      accessibilityLabel={`${host.name}, ${status}`}
      onPress={onOpenDetail}
      onLongPress={() => setActiveHost(host.hostId)}
      className="bg-card active:bg-elevated gap-4 rounded-[28px] px-5 pb-4 pt-5">
      <View className="flex-row items-center gap-4">
        <View
          style={{
            width: 66,
            height: 66,
            borderRadius: 33,
            borderWidth: 2,
            borderColor: ringColor(status),
            padding: 3,
          }}>
          <LinearGradient
            colors={HOST_GRADIENTS[index % HOST_GRADIENTS.length]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flex: 1,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text className="text-base font-bold text-white">{initials(host.name)}</Text>
          </LinearGradient>
        </View>

        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text numberOfLines={1} className="text-foreground min-w-0 shrink text-lg font-bold tracking-tight">
              {host.name}
            </Text>
            {active ? (
              <View className="bg-primary flex-row items-center gap-1 rounded-full px-2 py-0.5">
                <Icon as={Star} size={10} color={palette.primaryForeground} />
                <Text className="text-primary-foreground text-2xs font-bold">Active</Text>
              </View>
            ) : null}
          </View>
          <View className="flex-row items-center gap-1.5">
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: ringColor(status),
              }}
            />
            <Text
              numberOfLines={1}
              className="text-muted-foreground text-sm"
              style={{ fontVariant: ['tabular-nums'] }}>
              {statusLabel(status, runtime?.latencyMs ?? null)}
            </Text>
          </View>
          <Text numberOfLines={1} className="text-muted-foreground font-mono text-xs">
            {runtime?.endpoint ?? host.endpoints.join(', ')}
          </Text>
          {runtime?.lastError ? (
            <Text numberOfLines={1} className="text-destructive text-xs">
              {runtime.lastError}
            </Text>
          ) : null}
        </View>

        <Switch checked={wantsConnection} onCheckedChange={onToggle} />
      </View>

      <View className="flex-row items-center gap-2">
        {wantsConnection ? (
          <GlassPill icon={Unplug} label="Disconnect" onPress={() => disconnect(host.hostId)} />
        ) : (
          <GlassPill icon={Radio} label="Connect" onPress={() => void connect(host.hostId)} />
        )}
        <View className="flex-1" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Forget ${host.name}`}
          hitSlop={8}
          onPress={onForget}
          className="active:opacity-60 h-9 flex-row items-center gap-1.5 rounded-full px-3">
          <Icon as={Trash2} size={14} color={palette.destructive} />
          <Text className="text-destructive text-sm font-semibold">Forget</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}
