import { codexReasoningEffortLabel } from '@desktop/lib/agents/codex-labels';
import type {
  AgentApprovalPolicy,
  AgentSandboxMode,
} from '@desktop/lib/agents/types';

import { providerMeta } from '~/components/agents/agent-meta';
import type { NativeAgentProvider } from '~/lib/agents/stores';

export interface AgentProviderCapabilities {
  models: boolean;
  reasoning: boolean;
  approvalPolicy: boolean;
  sandbox: boolean;
  approvals: boolean;
  steer: boolean;
  interrupt: boolean;
  plan: boolean;
}

const CAPABILITIES: Record<NativeAgentProvider, AgentProviderCapabilities> = {
  codex: {
    models: true,
    reasoning: true,
    approvalPolicy: true,
    sandbox: true,
    approvals: true,
    steer: true,
    interrupt: true,
    plan: true,
  },
  claude: {
    models: true,
    reasoning: true,
    approvalPolicy: true,
    sandbox: true,
    approvals: true,
    steer: true,
    interrupt: true,
    plan: true,
  },
  opencode: {
    models: true,
    reasoning: true,
    approvalPolicy: true,
    sandbox: false,
    approvals: true,
    steer: true,
    interrupt: true,
    plan: true,
  },
  cursor: {
    models: true,
    reasoning: false,
    approvalPolicy: true,
    sandbox: false,
    approvals: false,
    steer: true,
    interrupt: true,
    plan: true,
  },
};

export function providerLabel(provider: NativeAgentProvider): string {
  return providerMeta(provider).label;
}

export function providerCapabilities(provider: NativeAgentProvider): AgentProviderCapabilities {
  return CAPABILITIES[provider] ?? CAPABILITIES.codex;
}

export const APPROVAL_POLICY_OPTIONS: ReadonlyArray<{
  value: AgentApprovalPolicy;
  label: string;
  description: string;
}> = [
  {
    value: 'untrusted',
    label: 'Ask for everything',
    description: 'Every command and edit needs an explicit approval.',
  },
  {
    value: 'on-request',
    label: 'Ask when needed',
    description: 'The agent decides when to escalate to you.',
  },
  {
    value: 'never',
    label: 'Never ask',
    description: 'Run without approval prompts. Use with care.',
  },
];

export const SANDBOX_OPTIONS: ReadonlyArray<{
  value: AgentSandboxMode;
  label: string;
  description: string;
}> = [
  {
    value: 'read-only',
    label: 'Read only',
    description: 'The agent can read the repository but not change it.',
  },
  {
    value: 'workspace-write',
    label: 'Workspace write',
    description: 'Writes are limited to the repository workspace.',
  },
  {
    value: 'danger-full-access',
    label: 'Full access',
    description: 'No sandbox. The agent can touch anything on the host.',
  },
];

export function approvalPolicyLabel(policy: AgentApprovalPolicy): string {
  return APPROVAL_POLICY_OPTIONS.find((option) => option.value === policy)?.label ?? policy;
}

export function sandboxModeLabel(mode: AgentSandboxMode): string {
  return SANDBOX_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

export function reasoningEffortLabel(effort: string): string {
  return effort ? codexReasoningEffortLabel(effort) : 'Default';
}
