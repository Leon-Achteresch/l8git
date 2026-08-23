import * as React from 'react';
import { View } from 'react-native';

import {
  AgentSheet,
  SheetChip,
  SheetMessage,
  SheetOption,
  SheetSection,
} from '~/components/agents/agent-sheet';
import { Text } from '~/components/ui/text';
import {
  tryChatStore,
  useChatStore,
  type AgentChatState,
  type NativeAgentProvider,
} from '~/lib/agents/stores';

import type {
  AgentApprovalPolicy,
  AgentModelOption,
  AgentSandboxMode,
} from '@desktop/lib/agents/types';

import {
  APPROVAL_POLICY_OPTIONS,
  SANDBOX_OPTIONS,
  providerCapabilities,
  providerLabel,
  reasoningEffortLabel,
} from './capabilities';

const NO_MODELS: AgentModelOption[] = [];

export interface AgentSettingsSummary {
  model: string | null;
  modelLabel: string;
  reasoningEffort: string;
  approvalPolicy: AgentApprovalPolicy;
  sandboxMode: AgentSandboxMode;
  efforts: AgentModelOption['reasoningEfforts'];
  models: AgentModelOption[];
}

export function useAgentSettings(provider: NativeAgentProvider): AgentSettingsSummary {
  const models = useChatStore(provider, (state) => state.models, NO_MODELS);
  const model = useChatStore(provider, (state) => state.model, null);
  const reasoningEffort = useChatStore(provider, (state) => state.reasoningEffort, '');
  const approvalPolicy = useChatStore<AgentApprovalPolicy>(
    provider,
    (state) => state.approvalPolicy,
    'on-request'
  );
  const sandboxMode = useChatStore<AgentSandboxMode>(
    provider,
    (state) => state.sandboxMode,
    'workspace-write'
  );

  return React.useMemo(() => {
    const selected = models.find((option) => option.id === model) ?? null;
    return {
      model,
      modelLabel: selected?.label ?? model ?? 'Default model',
      reasoningEffort,
      approvalPolicy,
      sandboxMode,
      efforts: selected?.reasoningEfforts ?? [],
      models,
    };
  }, [approvalPolicy, model, models, reasoningEffort, sandboxMode]);
}

export function AgentSettingsSheet({
  visible,
  onClose,
  provider,
  locked,
}: {
  visible: boolean;
  onClose: () => void;
  provider: NativeAgentProvider;
  locked: boolean;
}) {
  const capabilities = providerCapabilities(provider);
  const settings = useAgentSettings(provider);

  const apply = React.useCallback(
    (run: (state: AgentChatState) => void) => {
      const store = tryChatStore(provider);
      if (store) {
        run(store.getState());
      }
    },
    [provider]
  );

  const showReasoning = capabilities.reasoning && settings.efforts.length > 0;
  const selectedEffort = settings.efforts.find(
    (effort) => effort.value === settings.reasoningEffort
  );

  return (
    <AgentSheet
      visible={visible}
      onClose={onClose}
      title={`${providerLabel(provider)} settings`}
      description="Model, thinking effort and permissions for this conversation.">
      {capabilities.models ? (
        <SheetSection label="Model" hint={locked ? 'Applies to the next turn.' : undefined}>
          {settings.models.length === 0 ? (
            <SheetMessage>No model catalog reported by this provider yet.</SheetMessage>
          ) : (
            <View className="gap-2">
              {settings.models.map((option) => (
                <SheetOption
                  key={option.id}
                  label={option.label}
                  description={option.description || undefined}
                  selected={settings.model === option.id}
                  onPress={() => apply((state) => state.setModel(option.id))}
                />
              ))}
            </View>
          )}
        </SheetSection>
      ) : null}

      {showReasoning ? (
        <SheetSection label="Reasoning effort">
          <View className="flex-row flex-wrap gap-2">
            {settings.efforts.map((effort) => (
              <SheetChip
                key={effort.value}
                label={reasoningEffortLabel(effort.value)}
                active={settings.reasoningEffort === effort.value}
                onPress={() => apply((state) => state.setReasoningEffort(effort.value))}
              />
            ))}
          </View>
          {selectedEffort?.description ? (
            <Text className="text-muted-foreground text-xs leading-4">
              {selectedEffort.description}
            </Text>
          ) : null}
        </SheetSection>
      ) : null}

      {capabilities.approvalPolicy ? (
        <SheetSection label="Approval policy">
          <View className="gap-2">
            {APPROVAL_POLICY_OPTIONS.map((option) => (
              <SheetOption
                key={option.value}
                label={option.label}
                description={option.description}
                danger={option.value === 'never'}
                selected={settings.approvalPolicy === option.value}
                onPress={() => apply((state) => state.setApprovalPolicy(option.value))}
              />
            ))}
          </View>
        </SheetSection>
      ) : null}

      {capabilities.sandbox ? (
        <SheetSection label="Sandbox">
          <View className="gap-2">
            {SANDBOX_OPTIONS.map((option) => (
              <SheetOption
                key={option.value}
                label={option.label}
                description={option.description}
                danger={option.value === 'danger-full-access'}
                selected={settings.sandboxMode === option.value}
                onPress={() => apply((state) => state.setSandboxMode(option.value))}
              />
            ))}
          </View>
        </SheetSection>
      ) : null}

      {!capabilities.approvals ? (
        <SheetMessage>
          {providerLabel(provider)} does not surface interactive approvals — commands run under the
          policy configured on the host.
        </SheetMessage>
      ) : null}
    </AgentSheet>
  );
}
