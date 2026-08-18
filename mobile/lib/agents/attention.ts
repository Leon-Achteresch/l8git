import * as Haptics from 'expo-haptics';
import { AppState } from 'react-native';
import { create } from 'zustand';

import type { TurnAttentionNotification } from '@desktop/lib/agents/turn-attention';

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

export function notifyAgentTurn(notification: TurnAttentionNotification): void {
  if (isAgentAttentionMuted()) {
    return;
  }
  pushAgentNotice(notification.title, {
    tone: 'success',
    actionLabel: notification.action?.label,
    run: notification.action?.run,
  });
  agentAttentionHaptic();
}

export async function installTurnAttentionSink(): Promise<() => void> {
  const { setTurnAttentionSink } = await import('@desktop/lib/agents/turn-attention');
  setTurnAttentionSink({
    isFocused: isAppFocused,
    requestAttention: () => {
      if (!isAgentAttentionMuted()) {
        agentAttentionHaptic();
      }
    },
    notify: notifyAgentTurn,
  });
  return () => {
    setTurnAttentionSink({
      isFocused: () => true,
      requestAttention: () => undefined,
      notify: () => undefined,
    });
  };
}
