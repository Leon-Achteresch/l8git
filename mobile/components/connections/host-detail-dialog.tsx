import { Activity, Gauge, Radio, Server, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { ListGroup, ListRow } from '~/components/list-row';
import { IconBadge } from '~/components/shared/icon-badge';
import { StatusDot } from '~/components/status-dot';
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
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { classifyEndpoint, useConnections, useHostMeta, useHostRuntime } from '~/lib/connections';
import { palette } from '~/lib/theme';
import { statusTone } from './status';

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
          <DialogTitle>{meta?.name ?? 'Host'}</DialogTitle>
          <DialogDescription>{meta?.hostId ?? ''}</DialogDescription>
        </DialogHeader>

        <View className="flex-row items-center gap-2">
          <StatusDot tone={statusTone(runtime.status)} pulse={runtime.status !== 'online'} />
          <Text className="text-foreground text-sm font-medium capitalize">{runtime.status}</Text>
          {runtime.endpointKind ? (
            <Badge variant="secondary">
              <Text>{runtime.endpointKind === 'lan' ? 'LAN' : 'Relay'}</Text>
            </Badge>
          ) : null}
          {activeHostId === meta?.hostId ? (
            <Badge>
              <Text>Active</Text>
            </Badge>
          ) : null}
        </View>

        <ListGroup>
          <ListRow
            leading={<IconBadge icon={Gauge} color={palette.cat.green} size="md" />}
            title="Latency"
            subtitle="Ping round trip"
            meta={online && runtime.latencyMs !== null ? `${Math.round(runtime.latencyMs)} ms` : '—'}
          />
          <ListRow
            leading={<IconBadge icon={Radio} color={palette.cat.blue} size="md" />}
            title="Endpoint"
            subtitle={runtime.endpoint ?? 'not connected'}
            meta={runtime.endpoint ? classifyEndpoint(runtime.endpoint) : undefined}
          />
          <ListRow
            leading={<IconBadge icon={Server} color={palette.cat.purple} size="md" />}
            title="Host"
            subtitle={
              runtime.hostInfo
                ? `${runtime.hostInfo.platform ?? 'unknown'} · v${runtime.hostInfo.version ?? '?'}`
                : 'unknown'
            }
          />
          <ListRow
            leading={<IconBadge icon={Activity} color={palette.cat.orange} size="md" />}
            title="Reconnect attempts"
            meta={String(runtime.attempt)}
            subtitle={
              runtime.nextRetryAt
                ? `next try in ${Math.max(0, Math.round((runtime.nextRetryAt - Date.now()) / 1000))}s`
                : 'idle'
            }
          />
        </ListGroup>

        {runtime.lastError ? (
          <Alert icon={TriangleAlert} variant="destructive">
            <AlertTitle>Last error</AlertTitle>
            <AlertDescription>{runtime.lastError}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <View className="flex-row gap-2">
            {meta && activeHostId !== meta.hostId ? (
              <Button
                variant="outline"
                className="flex-1"
                onPress={() => setActiveHost(meta.hostId)}>
                <Text>Make active</Text>
              </Button>
            ) : null}
            {meta ? (
              <Button
                variant={online ? 'secondary' : 'default'}
                className="flex-1"
                onPress={() => (online ? disconnect(meta.hostId) : void connect(meta.hostId))}>
                <Icon as={Radio} className="text-foreground size-4" />
                <Text>{online ? 'Disconnect' : 'Connect'}</Text>
              </Button>
            ) : null}
          </View>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
