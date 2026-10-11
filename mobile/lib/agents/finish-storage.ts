import {
  agentReviewFinishContextIndexKey,
  agentReviewFinishStorageKey,
  agentReviewFinishStorageKeys,
  finishFlowStatus,
  hydrateAgentReviewFinishCheckpoint,
  readAgentReviewFinishCheckpoint,
  type AgentReviewFinishContext,
  type AgentReviewFinishSnapshot,
} from '@desktop/lib/agents/agent-review';
import { flushKvWrites, hydrateKv, kvGet, kvSet } from '@desktop/lib/platform/kv';

export type MobileFinishContext = AgentReviewFinishContext & { hostId: string };
export interface FinishRecoveryEntry {
  context: MobileFinishContext;
  checkpoint: AgentReviewFinishSnapshot;
}

/** Routes have only a host and worktree path, even after the worktree is removed. */
export function mobileFinishContextIndexKey(hostId: string): string {
  return `l8git.mobile-agent-review-finish-contexts.v1.${encodeURIComponent(hostId)}`;
}

function validContext(value: unknown, hostId: string): value is MobileFinishContext {
  if (!value || typeof value !== 'object') return false;
  const context = value as MobileFinishContext;
  return hostId.trim().length > 0 && context.hostId === hostId &&
    [context.worktreePath, context.basePath, context.sessionBranch, context.baseBranch]
      .every(part => typeof part === 'string' && part.trim().length > 0) &&
    context.worktreePath !== context.basePath && context.sessionBranch !== context.baseBranch &&
    (context.worktreeCreatedAt === undefined || Number.isSafeInteger(context.worktreeCreatedAt) && context.worktreeCreatedAt > 0);
}

function contextsFromCache(hostId: string): MobileFinishContext[] {
  try {
    const saved = JSON.parse(kvGet(mobileFinishContextIndexKey(hostId)) ?? 'null') as { version?: number; contexts?: unknown } | null;
    if (saved?.version !== 1 || !Array.isArray(saved.contexts)) return [];
    const contexts = new Map<string, MobileFinishContext>();
    for (const value of saved.contexts) {
      if (!validContext(value, hostId)) continue;
      const previous = contexts.get(value.worktreePath);
      if (!previous || (previous.worktreeCreatedAt ?? 0) <= (value.worktreeCreatedAt ?? 0)) contexts.set(value.worktreePath, value);
    }
    return [...contexts.values()];
  } catch { return []; }
}

function assertContext(context: AgentReviewFinishContext): asserts context is MobileFinishContext {
  if (!validContext(context, context.hostId ?? '')) throw new Error('The session recovery context is invalid.');
}

export async function rememberFinishContext(context: AgentReviewFinishContext): Promise<void> {
  assertContext(context);
  const manifestKey = mobileFinishContextIndexKey(context.hostId);
  const indexKey = agentReviewFinishContextIndexKey(context.worktreePath, context.basePath, context.hostId);
  await hydrateKv([manifestKey]);
  const contexts = contextsFromCache(context.hostId);
  const previous = contexts.find(entry => entry.worktreePath === context.worktreePath);
  // A delayed screen from an older worktree generation cannot replace its successor.
  if (previous && (previous.worktreeCreatedAt ?? 0) > (context.worktreeCreatedAt ?? 0)) return;
  const saved: MobileFinishContext = {
    hostId: context.hostId, worktreePath: context.worktreePath, basePath: context.basePath,
    sessionBranch: context.sessionBranch, baseBranch: context.baseBranch,
    ...(context.worktreeCreatedAt === undefined ? {} : { worktreeCreatedAt: context.worktreeCreatedAt }),
  };
  kvSet(manifestKey, JSON.stringify({ version: 1, contexts: [...contexts.filter(entry => entry.worktreePath !== context.worktreePath), saved] }));
  kvSet(indexKey, JSON.stringify(saved));
  await flushKvWrites([manifestKey, indexKey]);
}

/** Complete this before constructing the shared controller, whose restore is synchronous. */
export async function prepareFinishControllerContext(context: AgentReviewFinishContext): Promise<void> {
  assertContext(context);
  await hydrateAgentReviewFinishCheckpoint(context);
  await rememberFinishContext(context);
}

/** Retry the latest cached checkpoint before allowing an irreversible following step. */
export async function flushFinishCheckpoint(context: AgentReviewFinishContext): Promise<void> {
  assertContext(context);
  const checkpointKey = agentReviewFinishStorageKey(context);
  const checkpoint = kvGet(checkpointKey);
  if (!checkpoint || !readAgentReviewFinishCheckpoint(context)) throw new Error('The finish checkpoint is unavailable. Refresh the session before retrying.');
  kvSet(checkpointKey, checkpoint);
  await rememberFinishContext(context);
  await flushKvWrites([...agentReviewFinishStorageKeys(context), mobileFinishContextIndexKey(context.hostId)]);
}

function unfinished(checkpoint: AgentReviewFinishSnapshot): boolean {
  return finishFlowStatus(checkpoint.steps) !== 'done' && (checkpoint.worktreeRemoved || checkpoint.message.trim().length > 0 ||
    checkpoint.steps.some(step => step.status === 'done' || step.status === 'failed'));
}

async function pruneCompletedContexts(hostId: string, completed: ReadonlySet<string>): Promise<void> {
  if (completed.size === 0) return;
  const key = mobileFinishContextIndexKey(hostId);
  await hydrateKv([key]);
  const current = contextsFromCache(hostId);
  const retained = current.filter(context => {
    if (!completed.has(agentReviewFinishStorageKey(context))) return true;
    // Re-read the current cache: a concurrent screen may have restarted this
    // exact context or registered a newer generation during the storage reads.
    const latest = readAgentReviewFinishCheckpoint(context);
    return !latest || finishFlowStatus(latest.steps) !== 'done';
  });
  if (retained.length === current.length) return;
  kvSet(key, JSON.stringify({ version: 1, contexts: retained }));
  try { await flushKvWrites([key]); } catch { /* Compaction must not hide available recovery entries. */ }
}

export async function recoverFinishContext(hostId: string, worktreePath: string): Promise<MobileFinishContext | null> {
  if (!hostId.trim() || !worktreePath.trim()) return null;
  await hydrateKv([mobileFinishContextIndexKey(hostId)]);
  const context = contextsFromCache(hostId).find(entry => entry.worktreePath === worktreePath);
  if (!context) return null;
  await hydrateAgentReviewFinishCheckpoint(context);
  const checkpoint = readAgentReviewFinishCheckpoint(context);
  return checkpoint && unfinished(checkpoint) ? context : null;
}

export async function listUnfinishedFinishContexts(hostId: string): Promise<FinishRecoveryEntry[]> {
  if (!hostId.trim()) return [];
  await hydrateKv([mobileFinishContextIndexKey(hostId)]);
  const entries = await Promise.all(contextsFromCache(hostId).map(async context => {
    await hydrateAgentReviewFinishCheckpoint(context);
    const checkpoint = readAgentReviewFinishCheckpoint(context);
    return { context, checkpoint };
  }));
  await pruneCompletedContexts(hostId, new Set(entries.filter(entry => entry.checkpoint && finishFlowStatus(entry.checkpoint.steps) === 'done')
    .map(entry => agentReviewFinishStorageKey(entry.context))));
  return entries.filter((entry): entry is FinishRecoveryEntry => entry.checkpoint !== null && unfinished(entry.checkpoint))
    .sort((left, right) => left.context.basePath.localeCompare(right.context.basePath) || left.context.worktreePath.localeCompare(right.context.worktreePath));
}
