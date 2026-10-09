import {
  finishFlowStatus,
  type AgentReviewFinishSnapshot,
  type AgentReviewFinishContext,
  type AgentReviewFinishDependencies,
  type AgentReviewInvoke,
} from '@desktop/lib/agents/agent-review';

export interface ReviewFinishAvailability {
  hostId: string;
  worktreePath: string;
  available: boolean;
  busy: boolean;
}

/** Git finishing uses the bound host; the selected agent CLI may be unavailable. */
export function mobileFinishAvailable(online: boolean, connection: { bound: boolean }): boolean {
  return online && connection.bound;
}

function currentFinishScope(context: Pick<AgentReviewFinishContext, 'hostId' | 'worktreePath'>, current: ReviewFinishAvailability): boolean {
  return Boolean(context.hostId) && current.available &&
    current.hostId === context.hostId && current.worktreePath === context.worktreePath;
}

export function mobileFinishIsComplete(
  context: AgentReviewFinishContext,
  snapshot: AgentReviewFinishSnapshot,
  current: ReviewFinishAvailability
): boolean {
  return currentFinishScope(context, current) && !current.busy && snapshot.validated &&
    !snapshot.checking && !snapshot.checkError && finishFlowStatus(snapshot.steps) === 'done';
}

/** Captures the host independently of the app's active connection or agent binding. */
export function mobileFinishDependencies(
  context: AgentReviewFinishContext & { hostId: string },
  dependencies: {
    hostInvoke: <T>(hostId: string, command: string, args?: Record<string, unknown>) => Promise<T>;
    current: () => ReviewFinishAvailability;
    flushCheckpoint: () => Promise<void>;
    onChanged: () => Promise<void>;
  }
): AgentReviewFinishDependencies {
  const hostId = context.hostId;
  const worktreePath = context.worktreePath;
  const invoke: AgentReviewInvoke = (command, args) => dependencies.hostInvoke(hostId, command, args);
  return {
    invoke,
    isCurrent: () => {
      const current = dependencies.current();
      return currentFinishScope({ hostId, worktreePath }, current);
    },
    isBusy: () => dependencies.current().busy,
    flushCheckpoint: dependencies.flushCheckpoint,
    onChanged: dependencies.onChanged,
  };
}
