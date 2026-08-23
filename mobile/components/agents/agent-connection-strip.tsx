import { PlugZap, RotateCw, TriangleAlert, WifiOff } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { providerMeta } from '~/components/agents/agent-meta';
import { Spinner } from '~/components/shared/spinner';
import { GlassPill } from '~/components/ui/glass';
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
        'flex-row items-center gap-3 rounded-3xl px-4 py-3.5',
        danger ? 'bg-destructive/12' : 'bg-card'
      )}>
      <View
        className={cn(
          'h-9 w-9 items-center justify-center rounded-full',
          danger ? 'bg-destructive/15' : 'bg-white/10'
        )}>
        {connection.status === 'connecting' ? (
          <Spinner size={14} className="text-foreground" />
        ) : (
          <Icon
            as={danger ? TriangleAlert : connection.status === 'offline' ? WifiOff : PlugZap}
            size={15}
            className={danger ? 'text-destructive' : 'text-foreground'}
          />
        )}
      </View>
      <Text
        numberOfLines={2}
        className={cn('flex-1 text-sm', danger ? 'text-destructive' : 'text-muted-foreground')}>
        {copy}
      </Text>
      {connection.status === 'error' ? (
        <GlassPill icon={RotateCw} label="Retry" onPress={connection.reconnect} />
      ) : null}
    </Animated.View>
  );
}
