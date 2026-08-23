import type {
  TurnAttentionNotification,
  TurnAttentionTarget,
} from '@desktop/lib/agents/turn-attention';

export interface TurnNoticeThread extends TurnAttentionTarget {
  hostId: string;
}

export type TurnNoticeNavigator = (target: TurnNoticeThread) => void;

export function turnNoticeRun(
  notification: TurnAttentionNotification,
  hostId: string | null,
  open: TurnNoticeNavigator
): (() => void) | null {
  const target = notification.target;
  if (!target || !hostId) {
    return null;
  }
  return () => open({ ...target, hostId });
}
