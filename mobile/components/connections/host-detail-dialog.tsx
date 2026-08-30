import { Activity, Gauge, Radio, Server, Star, TriangleAlert, Unplug, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { ListGroup, ListRow } from '~/components/list-row';
import { HostAvatar, hostRingColor } from '~/components/host-avatar';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { SolidPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { classifyEndpoint, useConnections, useHostMeta, useHostRuntime } from '~/lib/connections';
import { palette } from '~/lib/theme';

function RowIcon({ icon }: { icon: LucideIcon }) {
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.10)',
      }}>
      <Icon as={icon} size={17} color={palette.foreground} />
    </View>
  );
}

export function HostDetailDialog({
  hostId,
  onOpenChange,
}: {
  hostId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const meta = useHostMeta(hostId);
  const runtime = useHostRuntime(hostId);
  const measureLatency = useConnections((state) => state.measureLatency);
  const connect = useConnections((state) => state.connect);
  const disconnect = useConnections((state) => state.disconnect);
  const setActiveHost = useConnections((state) => state.setActiveHost);
  const activeHostId = useConnections((state) => state.activeHostId);

  React.useEffect(() => {
    if (!hostId || runtime.status !== 'online') {
      return;
    }
    void measureLatency(hostId);
    const timer = setInterval(() => void measureLatency(hostId), 5_000);
    return () => clearInterval(timer);
  }, [hostId, measureLatency, runtime.status]);

  const online = runtime.status === 'online';

  return (
    <Dialog open={Boolean(hostId)} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md gap-4">
        <DialogHeader>
          <View className="flex-row items-center gap-3.5">
            <HostAvatar name={meta?.name ?? 'Host'} size={56} status={runtime.status} />
            <View className="min-w-0 flex-1 gap-0.5">
              <DialogTitle numberOfLines={1}>{meta?.name ?? 'Host'}</DialogTitle>
              <DialogDescription numberOfLines={1} className="font-mono text-xs">
                {meta?.hostId ?? ''}
              </DialogDescription>
            </View>
          </View>
        </DialogHeader>

        <View className="flex-row flex-wrap items-center gap-2">
          <View className="flex-row items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: hostRingColor(runtime.status) }} />
            <Text className="text-foreground text-xs font-semibold capitalize">{runtime.status}</Text>
          </View>
          {runtime.endpointKind ? (
            <Badge variant="secondary">
              <Text>{runtime.endpointKind === 'lan' ? 'LAN' : 'Relay'}</Text>
            </Badge>
          ) : null}
          {activeHostId === meta?.hostId ? (
            <Badge>
              <Icon as={Star} size={10} color={palette.primaryForeground} />
              <Text>Active</Text>
            </Badge>
          ) : null}
        </View>

        <ListGroup>
          <ListRow
            leading={<RowIcon icon={Gauge} />}
            title="Latency"
            subtitle="Ping round trip"
            meta={online && runtime.latencyMs !== null ? `${Math.round(runtime.latencyMs)} ms` : '—'}
            className="bg-elevated"
          />
          <ListRow
            leading={<RowIcon icon={Radio} />}
            title="Endpoint"
            subtitle={runtime.endpoint ?? 'not connected'}
            meta={runtime.endpoint ? classifyEndpoint(runtime.endpoint) : undefined}
            className="bg-elevated"
          />
          <ListRow
            leading={<RowIcon icon={Server} />}
            title="Host"
            subtitle={
              runtime.hostInfo
                ? `${runtime.hostInfo.platform ?? 'unknown'} · v${runtime.hostInfo.version ?? '?'}`
                : 'unknown'
            }
            className="bg-elevated"
          />
          <ListRow
            leading={<RowIcon icon={Activity} />}
            title="Reconnect attempts"
            meta={String(runtime.attempt)}
            subtitle={
              runtime.nextRetryAt
                ? `next try in ${Math.max(0, Math.round((runtime.nextRetryAt - Date.now()) / 1000))}s`
                : 'idle'
            }
            className="bg-elevated"
          />
        </ListGroup>

        {runtime.lastError ? (
          <Alert icon={TriangleAlert} variant="destructive" className="bg-elevated">
            <AlertTitle>Last error</AlertTitle>
            <AlertDescription>{runtime.lastError}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <View className="gap-2.5">
            {meta ? (
              online ? (
                <Button
                  variant="outline"
                  size="lg"
                  onPress={() => disconnect(meta.hostId)}>
                  <Icon as={Unplug} size={16} color={palette.foreground} />
                  <Text>Disconnect</Text>
                </Button>
              ) : (
                <SolidPill icon={Radio} label="Connect" onPress={() => void connect(meta.hostId)} />
              )
            ) : null}
            {meta && activeHostId !== meta.hostId ? (
              <Button variant="ghost" size="lg" onPress={() => setActiveHost(meta.hostId)}>
                <Icon as={Star} size={16} color={palette.foreground} />
                <Text>Make active</Text>
              </Button>
            ) : null}
          </View>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
