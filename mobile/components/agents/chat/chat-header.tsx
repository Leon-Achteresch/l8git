import { ChevronLeft, Settings2 } from 'lucide-react-native';
import { View } from 'react-native';

import { StatusPill, type PillTone } from '~/components/shared/status-pill';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import type { NativeAgentProvider } from '~/lib/agents/stores';

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
    <View className="border-border flex-row items-center gap-1 border-b px-1.5 py-1.5">
      <Button size="icon" variant="ghost" accessibilityLabel="Back" onPress={onBack}>
        <Icon as={ChevronLeft} size={20} className="text-foreground" />
      </Button>

      <View className="min-w-0 flex-1 gap-0.5 pl-0.5">
        <Text numberOfLines={1} className="text-foreground text-sm font-semibold tracking-tight">
          {title || providerLabel(provider)}
        </Text>
        <Text numberOfLines={1} className="text-muted-foreground text-2xs">
          {subtitle}
        </Text>
      </View>

      <StatusPill
        size="xs"
        dot
        tone={TURN_TONE[turnState]}
        label={TURN_LABEL[turnState]}
        className="shrink-0"
      />

      <Button
        size="icon"
        variant="ghost"
        accessibilityLabel="Conversation settings"
        onPress={onOpenSettings}>
        <Icon as={Settings2} size={17} className="text-muted-foreground" />
      </Button>
    </View>
  );
}
