import { CircleAlert, CircleCheck, Info, X } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { repoName } from '~/components/shared/format';
import { Icon } from '~/components/ui/icon';
import { Progress } from '~/components/ui/progress';
import { Text } from '~/components/ui/text';
import { useConnections } from '~/lib/connections';
import {
  cancelRemoteOp,
  remoteOpLabel,
  useOldestRemoteOp,
  useRemoteOps,
  useRemoteProgressBridge,
  type RemoteOpEntry,
  type RemoteOpResult,
} from '~/lib/repo/remote-ops';
import { cn } from '~/lib/utils';

const RESULT_TTL_MS = 5_000;

function useHostLabel(hostId: string): string | null {
  return useConnections((state) => {
    if (state.hosts.length < 2) {
      return null;
    }
    return state.hosts.find((host) => host.hostId === hostId)?.name ?? hostId;
  });
}

function ActiveOpCard({ op }: { op: RemoteOpEntry }) {
  const hostLabel = useHostLabel(op.hostId);
  const scope = [hostLabel, repoName(op.repoPath)].filter(Boolean).join(' · ');

  return (
    <View className="border-border bg-popover gap-2 rounded-2xl border p-3 shadow-lg shadow-black/40">
      <View className="flex-row items-center gap-2">
        <Text className="text-foreground flex-1 text-xs font-medium">
          {remoteOpLabel(op.op)}
          {op.phase ? ` · ${op.phase}` : ''}
        </Text>
        {op.percent !== null ? (
          <Text className="text-muted-foreground font-mono text-2xs">{op.percent}%</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel operation"
          hitSlop={10}
          onPress={() => void cancelRemoteOp(op.hostId, op.opId)}>
          <Icon as={X} size={13} className="text-muted-foreground" />
        </Pressable>
      </View>
      <Progress
        value={op.percent ?? 0}
        className="h-1"
        indicatorClassName={op.percent === null ? 'bg-muted-foreground/40' : 'bg-primary'}
      />
      <View className="flex-row items-center gap-2">
        {scope ? (
          <Text numberOfLines={1} className="text-muted-foreground/70 flex-1 text-2xs">
            {scope}
          </Text>
        ) : null}
        {op.detail ? (
          <Text numberOfLines={1} className="text-muted-foreground/70 flex-1 text-right font-mono text-2xs">
            {op.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ResultCard({ result, onDismiss }: { result: RemoteOpResult; onDismiss: () => void }) {
  const icon =
    result.tone === 'success' ? CircleCheck : result.tone === 'error' ? CircleAlert : Info;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss}>
      <View
        className={cn(
          'flex-row items-start gap-2.5 rounded-2xl border p-3 shadow-lg shadow-black/40',
          result.tone === 'error'
            ? 'border-destructive/40 bg-destructive/15'
            : result.tone === 'success'
              ? 'border-success/35 bg-popover'
              : 'border-border bg-popover'
        )}>
        <Icon
          as={icon}
          size={14}
          className={
            result.tone === 'error'
              ? 'text-destructive'
              : result.tone === 'success'
                ? 'text-success'
                : 'text-muted-foreground'
          }
        />
        <Text numberOfLines={4} className="text-foreground flex-1 text-xs">
          {result.message}
        </Text>
      </View>
    </Pressable>
  );
}

export function ProgressToastHost() {
  const insets = useSafeAreaInsets();
  const active = useOldestRemoteOp();
  const result = useRemoteOps((state) => state.result);
  const setResult = useRemoteOps((state) => state.setResult);

  useRemoteProgressBridge();

  React.useEffect(() => {
    if (!result) {
      return;
    }
    const timer = setTimeout(() => setResult(null), RESULT_TTL_MS);
    return () => clearTimeout(timer);
  }, [result, setResult]);

  if (!active && !result) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{ top: insets.top + 6 }}
      className="absolute left-4 right-4 z-50">
      <Animated.View
        key={active ? active.opId : result?.id}
        entering={FadeInUp.duration(180)}
        exiting={FadeOutUp.duration(140)}
        layout={LinearTransition.duration(180)}>
        {active ? (
          <ActiveOpCard op={active} />
        ) : result ? (
          <ResultCard result={result} onDismiss={() => setResult(null)} />
        ) : null}
      </Animated.View>
    </View>
  );
}
