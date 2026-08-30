import { ArrowLeft, Settings2 } from 'lucide-react-native';
import { View } from 'react-native';

import { StatusPill, type PillTone } from '~/components/shared/status-pill';
import { Glass, GlassCircle } from '~/components/ui/glass';
import { Text } from '~/components/ui/text';
import type { NativeAgentProvider } from '~/lib/agents/stores';

import { ProviderMark } from '~/components/agents/provider-badge';
import { providerLabel } from './capabilities';

export type AgentTurnState = 'working' | 'ready' | 'connecting' | 'error' | 'idle' | 'offline';

const TURN_TONE: Record<AgentTurnState, PillTone> = {
  working: 'branch',
  ready: 'success',
  connecting: 'warning',
  error: 'danger',
  idle: 'neutral',
  offline: 'neutral',
};

const TURN_LABEL: Record<AgentTurnState, string> = {
  working: 'Working',
  ready: 'Ready',
  connecting: 'Connecting',
  error: 'Error',
  idle: 'Idle',
  offline: 'Offline',
};

export function AgentChatHeader({
  provider,
  title,
  subtitle,
  turnState,
  onBack,
  onOpenSettings,
}: {
  provider: NativeAgentProvider;
  title: string;
  subtitle: string;
  turnState: AgentTurnState;
  onBack: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
      <GlassCircle icon={ArrowLeft} label="Back" onPress={onBack} />

      <Glass
        style={{
          flex: 1,
          height: 46,
          borderRadius: 23,
          paddingLeft: 6,
          paddingRight: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}>
        <ProviderMark provider={provider} size={34} />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-foreground text-sm font-bold">
            {title || providerLabel(provider)}
          </Text>
          <Text numberOfLines={1} className="text-muted-foreground text-2xs">
            {subtitle}
          </Text>
        </View>
        <StatusPill size="xs" dot tone={TURN_TONE[turnState]} label={TURN_LABEL[turnState]} className="shrink-0" />
      </Glass>

      <GlassCircle icon={Settings2} label="Conversation settings" onPress={onOpenSettings} />
    </View>
  );
}
