import { View } from 'react-native';

import { providerMeta } from '~/components/agents/agent-meta';
import { Text } from '~/components/ui/text';
import type { NativeAgentProvider } from '~/lib/agents/stores';
import { cn } from '~/lib/utils';

export function ProviderMark({
  provider,
  size = 28,
  dimmed = false,
  className,
}: {
  provider: NativeAgentProvider;
  size?: number;
  dimmed?: boolean;
  className?: string;
}) {
  const meta = providerMeta(provider);
  return (
    <View
      accessibilityLabel={meta.label}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.34),
        backgroundColor: meta.tint,
        borderColor: `${meta.color}3d`,
        opacity: dimmed ? 0.55 : 1,
      }}
      className={cn('items-center justify-center border', className)}>
      <Text
        style={{ color: meta.color, fontSize: Math.round(size * 0.36) }}
        className="font-mono font-medium">
        {meta.mark}
      </Text>
    </View>
  );
}

export function ProviderBadge({
  provider,
  showLabel = true,
  className,
}: {
  provider: NativeAgentProvider;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = providerMeta(provider);
  return (
    <View
      style={{ borderColor: `${meta.color}38`, backgroundColor: meta.tint }}
      className={cn('flex-row items-center gap-1.5 rounded-full border px-2 py-0.5', className)}>
      <View style={{ backgroundColor: meta.color }} className="h-1.5 w-1.5 rounded-full" />
      {showLabel ? (
        <Text style={{ color: meta.color }} className="text-2xs font-medium">
          {meta.short}
        </Text>
      ) : null}
    </View>
  );
}
