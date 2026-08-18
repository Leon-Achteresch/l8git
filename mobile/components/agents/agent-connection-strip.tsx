import { PlugZap, TriangleAlert, WifiOff } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { providerMeta } from '~/components/agents/agent-meta';
import { Spinner } from '~/components/shared/spinner';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import type { AgentConnection } from '~/lib/agents/use-agent-connection';
import { cn } from '~/lib/utils';

export function AgentConnectionStrip({ connection }: { connection: AgentConnection }) {
  if (connection.status === 'ready' || connection.status === 'idle') {
    return null;
  }

  const label = connection.hostName ?? connection.hostId ?? 'host';
  const agent = providerMeta(connection.provider).short;

  const copy =
    connection.status === 'offline'
      ? `${label} is offline — showing the last cached threads.`
      : connection.status === 'error'
        ? (connection.error ?? `${agent} could not start on ${label}.`)
        : `Connecting ${agent} on ${label}…`;

  const danger = connection.status === 'error';

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      className={cn(
        'flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5',
        danger ? 'border-destructive/35 bg-destructive/10' : 'border-border bg-muted/50'
      )}>
      {connection.status === 'connecting' ? (
        <Spinner size={13} className="text-muted-foreground" />
      ) : (
        <Icon
          as={danger ? TriangleAlert : connection.status === 'offline' ? WifiOff : PlugZap}
          size={13}
          className={danger ? 'text-destructive' : 'text-muted-foreground'}
        />
      )}
      <Text
        numberOfLines={2}
        className={cn('flex-1 text-xs', danger ? 'text-destructive' : 'text-muted-foreground')}>
        {copy}
      </Text>
      {connection.status === 'error' ? (
        <Button size="sm" variant="outline" onPress={connection.reconnect}>
          <Text>Retry</Text>
        </Button>
      ) : null}
    </Animated.View>
  );
}
