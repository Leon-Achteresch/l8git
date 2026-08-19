import type { NativeAgentProvider } from "@/lib/agents/provider-store";

export interface TurnAttentionTarget {
  provider: NativeAgentProvider;
  path: string;
  threadId: string;
}

export interface TurnAttentionNotification {
  title: string;
  target?: TurnAttentionTarget;
  action?: { label: string; run: () => void };
}

export interface TurnAttentionSink {
  isFocused: () => boolean;
  requestAttention: () => void;
  notify: (notification: TurnAttentionNotification) => void;
}

const inertSink: TurnAttentionSink = {
  isFocused: () => true,
  requestAttention: () => {},
  notify: () => {},
};

let sink: TurnAttentionSink = inertSink;

export function setTurnAttentionSink(next: TurnAttentionSink): void {
  sink = next;
}

export function turnAttentionSink(): TurnAttentionSink {
  return sink;
}
