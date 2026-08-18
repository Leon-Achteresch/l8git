import * as React from 'react';
import { View } from 'react-native';

import { OptionRow, Sheet, SheetField, SheetNote } from '~/components/repo/sheet';
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

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`${providerLabel(provider)} settings`}
      description="Model, thinking effort and permissions for this conversation.">
      {capabilities.models ? (
        <SheetField label="Model" hint={locked ? 'Applies to the next turn.' : undefined}>
          {settings.models.length === 0 ? (
            <SheetNote>No model catalog reported by this provider yet.</SheetNote>
          ) : (
            <View className="gap-2">
              {settings.models.map((option) => (
                <OptionRow
                  key={option.id}
                  label={option.label}
                  description={option.description || undefined}
                  selected={settings.model === option.id}
                  onPress={() => apply((state) => state.setModel(option.id))}
                />
              ))}
            </View>
          )}
        </SheetField>
      ) : null}

      {showReasoning ? (
        <SheetField label="Reasoning effort">
          <View className="gap-2">
            {settings.efforts.map((effort) => (
              <OptionRow
                key={effort.value}
                label={reasoningEffortLabel(effort.value)}
                description={effort.description || undefined}
                selected={settings.reasoningEffort === effort.value}
                onPress={() => apply((state) => state.setReasoningEffort(effort.value))}
              />
            ))}
          </View>
        </SheetField>
      ) : null}

      {capabilities.approvalPolicy ? (
        <SheetField label="Approval policy">
          <View className="gap-2">
            {APPROVAL_POLICY_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                description={option.description}
                danger={option.value === 'never'}
                selected={settings.approvalPolicy === option.value}
                onPress={() => apply((state) => state.setApprovalPolicy(option.value))}
              />
            ))}
          </View>
        </SheetField>
      ) : null}

      {capabilities.sandbox ? (
        <SheetField label="Sandbox">
          <View className="gap-2">
            {SANDBOX_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                description={option.description}
                danger={option.value === 'danger-full-access'}
                selected={settings.sandboxMode === option.value}
                onPress={() => apply((state) => state.setSandboxMode(option.value))}
              />
            ))}
          </View>
        </SheetField>
      ) : null}

      {!capabilities.approvals ? (
        <SheetNote>
          <Text className="text-muted-foreground text-xs">
            {providerLabel(provider)} does not surface interactive approvals — commands run under
            the policy configured on the host.
          </Text>
        </SheetNote>
      ) : null}
    </Sheet>
  );
}
