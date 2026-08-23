import { CircleAlert, CircleCheck, Info, X } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { repoName } from '~/components/shared/format';
import { Glass } from '~/components/ui/glass';
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
import { palette } from '~/lib/theme';

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
    <Glass intensity={50} style={{ borderRadius: 24, padding: 14, gap: 10 }}>
      <View className="flex-row items-center gap-2.5">
        <Text className="text-foreground flex-1 text-sm font-semibold">
          {remoteOpLabel(op.op)}
          {op.phase ? ` · ${op.phase}` : ''}
        </Text>
        {op.percent !== null ? (
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-muted-foreground font-mono text-xs">
            {op.percent}%
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel operation"
          hitSlop={10}
          onPress={() => void cancelRemoteOp(op.hostId, op.opId)}
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.12)',
          }}>
          <Icon as={X} size={13} color={palette.foreground} />
        </Pressable>
      </View>
      <Progress
        value={op.percent ?? 0}
        className="bg-white/10 h-1"
        indicatorClassName={op.percent === null ? 'bg-white/40' : 'bg-primary'}
      />
      <View className="flex-row items-center gap-2">
        {scope ? (
          <Text numberOfLines={1} className="text-muted-foreground flex-1 text-2xs">
            {scope}
          </Text>
        ) : null}
        {op.detail ? (
          <Text
            numberOfLines={1}
            className="text-muted-foreground flex-1 text-right font-mono text-2xs">
            {op.detail}
          </Text>
        ) : null}
      </View>
    </Glass>
  );
}

function ResultCard({ result, onDismiss }: { result: RemoteOpResult; onDismiss: () => void }) {
  const icon =
    result.tone === 'success' ? CircleCheck : result.tone === 'error' ? CircleAlert : Info;
  const color =
    result.tone === 'error'
      ? palette.destructive
      : result.tone === 'success'
        ? palette.success
        : palette.mutedForeground;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss}>
      <Glass
        intensity={50}
        style={{
          borderRadius: 24,
          paddingVertical: 12,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.12)',
          }}>
          <Icon as={icon} size={15} color={color} />
        </View>
        <Text numberOfLines={4} className="text-foreground flex-1 text-sm font-medium">
          {result.message}
        </Text>
      </Glass>
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
      className="absolute left-5 right-5 z-50">
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
