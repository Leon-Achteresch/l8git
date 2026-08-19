import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppState } from 'react-native';
import { create } from 'zustand';

import type { TurnAttentionNotification } from '@desktop/lib/agents/turn-attention';

import { turnNoticeRun, type TurnNoticeNavigator } from './turn-notice';

export { turnNoticeRun };
export type { TurnNoticeNavigator, TurnNoticeThread } from './turn-notice';

export type AgentNoticeTone = 'info' | 'success' | 'attention';

export interface AgentNotice {
  id: string;
  title: string;
  tone: AgentNoticeTone;
  actionLabel: string | null;
  createdAt: number;
  run: (() => void) | null;
}

const MAX_NOTICES = 3;

let sequence = 0;

function noticeId(): string {
  sequence += 1;
  return `agent-notice-${Date.now().toString(36)}-${sequence}`;
}

interface AgentNoticeState {
  notices: AgentNotice[];
  push: (notice: Omit<AgentNotice, 'id' | 'createdAt'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useAgentNotices = create<AgentNoticeState>((set) => ({
  notices: [],
  push: (notice) => {
    const id = noticeId();
    set((state) => ({
      notices: [...state.notices, { ...notice, id, createdAt: Date.now() }].slice(-MAX_NOTICES),
    }));
    return id;
  },
  dismiss: (id) =>
    set((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) })),
  clear: () => set({ notices: [] }),
}));

export function pushAgentNotice(
  title: string,
  options: { tone?: AgentNoticeTone; actionLabel?: string; run?: () => void } = {}
): string {
  return useAgentNotices.getState().push({
    title,
    tone: options.tone ?? 'info',
    actionLabel: options.actionLabel ?? null,
    run: options.run ?? null,
  });
}

export function isAppFocused(): boolean {
  return AppState.currentState === 'active';
}

let muteDepth = 0;

export function isAgentAttentionMuted(): boolean {
  return muteDepth > 0;
}

export function muteAgentAttention<T>(run: () => T): T {
  muteDepth += 1;
  try {
    return run();
  } finally {
    muteDepth = Math.max(0, muteDepth - 1);
  }
}

export function agentAttentionHaptic(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function agentApprovalHaptic(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

export function agentSendHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function notifyAgentTurn(
  notification: TurnAttentionNotification,
  hostId: string | null,
  open: TurnNoticeNavigator
): void {
  if (isAgentAttentionMuted()) {
    return;
  }
  const run = turnNoticeRun(notification, hostId, open);
  pushAgentNotice(notification.title, {
    tone: 'success',
    actionLabel: run ? notification.action?.label : undefined,
    run: run ?? undefined,
  });
  agentAttentionHaptic();
}

export async function installTurnAttentionSink(): Promise<() => void> {
  const [{ setTurnAttentionSink }, route, binding] = await Promise.all([
    import('@desktop/lib/agents/turn-attention'),
    import('~/components/agents/chat/route'),
    import('./use-agent-connection'),
  ]);
  const open: TurnNoticeNavigator = (target) => {
    route.bindAgentThreadTarget(target);
    router.push(route.agentThreadHref(target));
  };
  setTurnAttentionSink({
    isFocused: isAppFocused,
    requestAttention: () => {
      if (!isAgentAttentionMuted()) {
        agentAttentionHaptic();
      }
    },
    notify: (notification) =>
      notifyAgentTurn(notification, binding.boundAgentHostId(), open),
  });
  return () => {
    setTurnAttentionSink({
      isFocused: () => true,
      requestAttention: () => undefined,
      notify: () => undefined,
    });
  };
}
