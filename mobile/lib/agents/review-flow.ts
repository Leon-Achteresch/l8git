export interface FinishFlowIdentity {
  hostId: string;
  worktreePath: string;
}

export interface FinishFlowBranch {
  sessionBranch: string;
}

export function finishFlowKey(
  session: FinishFlowIdentity | null,
  summary: FinishFlowBranch | null
): string | null {
  if (!session || !summary) {
    return null;
  }
  return [session.hostId, session.worktreePath, summary.sessionBranch].join('\u0000');
}
