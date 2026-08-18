import type { AgentOverviewStatus } from '@desktop/lib/agents/overview';

import type { PillTone } from '~/components/shared/status-pill';
import type { NativeAgentProvider } from '~/lib/agents/stores';

export interface AgentProviderMeta {
  value: NativeAgentProvider;
  label: string;
  short: string;
  mark: string;
  description: string;
  color: string;
  tint: string;
}

export const AGENT_PROVIDER_META: Record<NativeAgentProvider, AgentProviderMeta> = {
  codex: {
    value: 'codex',
    label: 'Codex',
    short: 'Codex',
    mark: 'CX',
    description: 'OpenAI CLI',
    color: '#f4f2ee',
    tint: 'rgba(244,242,238,0.12)',
  },
  claude: {
    value: 'claude',
    label: 'Claude Code',
    short: 'Claude',
    mark: 'CL',
    description: 'Anthropic CLI',
    color: '#d97757',
    tint: 'rgba(217,119,87,0.16)',
  },
  opencode: {
    value: 'opencode',
    label: 'OpenCode',
    short: 'OpenCode',
    mark: 'OC',
    description: 'OpenCode ACP',
    color: '#0dcaa9',
    tint: 'rgba(13,202,169,0.16)',
  },
  cursor: {
    value: 'cursor',
    label: 'Cursor CLI',
    short: 'Cursor',
    mark: 'CU',
    description: 'Cursor Agent',
    color: '#b599ff',
    tint: 'rgba(181,153,255,0.16)',
  },
};

export const AGENT_PROVIDER_ORDER: readonly NativeAgentProvider[] = [
  'codex',
  'claude',
  'opencode',
  'cursor',
];

export function providerMeta(provider: NativeAgentProvider): AgentProviderMeta {
  return AGENT_PROVIDER_META[provider] ?? AGENT_PROVIDER_META.codex;
}

export interface AgentStatusMeta {
  label: string;
  short: string;
  tone: PillTone;
  color: string;
}

export const AGENT_STATUS_META: Record<AgentOverviewStatus, AgentStatusMeta> = {
  awaitingApproval: {
    label: 'Needs approval',
    short: 'Approval',
    tone: 'warning',
    color: '#fcb442',
  },
  running: { label: 'Running', short: 'Running', tone: 'branch', color: '#65bdff' },
  failed: { label: 'Failed', short: 'Failed', tone: 'danger', color: '#ff7a73' },
  idle: { label: 'Idle', short: 'Idle', tone: 'neutral', color: '#b5afa6' },
};

export function statusMeta(status: AgentOverviewStatus): AgentStatusMeta {
  return AGENT_STATUS_META[status] ?? AGENT_STATUS_META.idle;
}
