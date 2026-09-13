import type {
  AgentApprovalPolicy,
  AgentCollaborationMode,
  AgentPersonality,
  AgentRealtimeVoice,
  AgentReasoningEffort,
  AgentSandboxMode,
  AgentThreadSummary,
} from "@/lib/agents/types";
import { invoke } from "@/lib/platform/ipc";
import { kvGet, kvSet } from "@/lib/platform/kv";
import {
  AGENT_COMPOSER_DRAFTS_KEY,
  AGENT_INSTANCE_MIGRATION_KEY,
  AGENT_INSTANCE_MIGRATION_VERSION,
  AGENT_SESSION_CATALOG_KEY as STORAGE_KEY,
  defaultInstanceId,
} from "@/lib/agents/storage-keys";
import { loadResumeCursors, saveResumeCursors } from "@/lib/agents/resume-cursor";

const SAVE_DELAY_MS = 350;
const CATALOG_DRIVER = "codex";

export interface AgentSessionCatalog {
  threadsByPath: Record<string, AgentThreadSummary[]>;
  activeThreadByPath: Record<string, string | null>;
  instanceByThreadId?: Record<string, string>;
  model: string | null;
  reasoningEffort: AgentReasoningEffort;
  serviceTier: string | null;
  personality: AgentPersonality;
  collaborationMode: AgentCollaborationMode;
  permissionProfile: string | null;
  realtimeVoice: AgentRealtimeVoice | null;
  approvalPolicy: AgentApprovalPolicy;
  sandboxMode: AgentSandboxMode;
}

export interface ThreadForkInfo {
  threadId: string;
  upToMessageUuid: string;
}

export type ForkableThreadSummary = AgentThreadSummary & {
  forkedFrom?: ThreadForkInfo;
  ephemeral?: boolean;
};

export type SnoozableThreadSummary = AgentThreadSummary & {
  snoozedUntil?: number | null;
  settled?: boolean;
};

let pendingCatalog: AgentSessionCatalog | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeThreads(value: unknown): Record<string, AgentThreadSummary[]> {
  if (!isRecord(value)) return {};
  const result: Record<string, AgentThreadSummary[]> = {};
  for (const [path, candidates] of Object.entries(value)) {
    if (!Array.isArray(candidates)) continue;
    result[path] = candidates.flatMap((candidate) => {
      if (
        !isRecord(candidate) ||
        typeof candidate.id !== "string" ||
        typeof candidate.title !== "string"
      ) {
        return [];
      }
      const forkedFrom = isRecord(candidate.forkedFrom) &&
        typeof candidate.forkedFrom.threadId === "string" &&
        typeof candidate.forkedFrom.upToMessageUuid === "string"
        ? { threadId: candidate.forkedFrom.threadId, upToMessageUuid: candidate.forkedFrom.upToMessageUuid }
        : undefined;
      return [{
        id: candidate.id,
        path: typeof candidate.path === "string" ? candidate.path : path,
        title: candidate.title,
        preview: typeof candidate.preview === "string" ? candidate.preview : "",
        createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : 0,
        updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : 0,
        status: "idle",
        modelProvider: typeof candidate.modelProvider === "string"
          ? candidate.modelProvider
          : "openai",
        isPinned: candidate.isPinned === true,
        archived: candidate.archived === true,
        additions: typeof candidate.additions === "number" ? candidate.additions : undefined,
        deletions: typeof candidate.deletions === "number" ? candidate.deletions : undefined,
        ...(forkedFrom ? { forkedFrom } : {}),
      } satisfies ForkableThreadSummary];
    });
  }
  return result;
}

function normalizeActiveThreads(value: unknown): Record<string, string | null> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([path, threadId]) =>
      typeof threadId === "string" || threadId === null ? [[path, threadId]] : [],
    ),
  );
}

function normalizeInstanceByThreadId(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([threadId, instanceId]) =>
      typeof instanceId === "string" && instanceId ? [[threadId, instanceId]] : [],
    ),
  );
}

function migrateInstanceAssignments(
  threadsByPath: Record<string, AgentThreadSummary[]>,
  instanceByThreadId: Record<string, string>,
): Record<string, string> {
  if (kvGet(AGENT_INSTANCE_MIGRATION_KEY) === String(AGENT_INSTANCE_MIGRATION_VERSION)) {
    return instanceByThreadId;
  }
  const migrated = { ...instanceByThreadId };
  for (const threads of Object.values(threadsByPath)) {
    for (const thread of threads) {
      if (!migrated[thread.id]) migrated[thread.id] = defaultInstanceId(CATALOG_DRIVER);
    }
  }
  try {
    kvSet(AGENT_INSTANCE_MIGRATION_KEY, String(AGENT_INSTANCE_MIGRATION_VERSION));
  } catch {}
  return migrated;
}

function catalogFromUnknown(value: unknown): Partial<AgentSessionCatalog> {
  if (!isRecord(value)) return {};
  const candidate = isRecord(value.state) ? value.state : value;
  const approvals: AgentApprovalPolicy[] = ["untrusted", "on-request", "never"];
  const sandboxes: AgentSandboxMode[] = ["read-only", "workspace-write", "danger-full-access"];
  const personalities: AgentPersonality[] = ["none", "friendly", "pragmatic"];
  const collaborationModes: AgentCollaborationMode[] = ["default", "plan"];
  const threadsByPath = normalizeThreads(candidate.threadsByPath);
  return {
    threadsByPath,
    activeThreadByPath: normalizeActiveThreads(candidate.activeThreadByPath),
    instanceByThreadId: migrateInstanceAssignments(
      threadsByPath,
      normalizeInstanceByThreadId(candidate.instanceByThreadId),
    ),
    model: typeof candidate.model === "string" || candidate.model === null
      ? candidate.model
      : undefined,
    reasoningEffort:
      typeof candidate.reasoningEffort === "string" && candidate.reasoningEffort.trim()
        ? candidate.reasoningEffort
        : undefined,
    serviceTier: typeof candidate.serviceTier === "string" || candidate.serviceTier === null
      ? candidate.serviceTier
      : undefined,
    personality: personalities.includes(candidate.personality as AgentPersonality)
      ? candidate.personality as AgentPersonality
      : undefined,
    collaborationMode: collaborationModes.includes(candidate.collaborationMode as AgentCollaborationMode)
      ? candidate.collaborationMode as AgentCollaborationMode
      : undefined,
    permissionProfile:
      typeof candidate.permissionProfile === "string" || candidate.permissionProfile === null
        ? candidate.permissionProfile
        : undefined,
    realtimeVoice: typeof candidate.realtimeVoice === "string"
      ? candidate.realtimeVoice as AgentRealtimeVoice
      : candidate.realtimeVoice === null
        ? null
        : undefined,
    approvalPolicy: approvals.includes(candidate.approvalPolicy as AgentApprovalPolicy)
      ? candidate.approvalPolicy as AgentApprovalPolicy
      : undefined,
    sandboxMode: sandboxes.includes(candidate.sandboxMode as AgentSandboxMode)
      ? candidate.sandboxMode as AgentSandboxMode
      : undefined,
  };
}

function updateThread(
  threadsByPath: Record<string, AgentThreadSummary[]>,
  path: string,
  threadId: string,
  patch: Partial<AgentThreadSummary>,
): Record<string, AgentThreadSummary[]> {
  const threads = threadsByPath[path];
  if (!threads) return threadsByPath;
  return {
    ...threadsByPath,
    [path]: threads.map((thread) => (thread.id === threadId ? { ...thread, ...patch } : thread)),
  };
}

export function renameThread(
  threadsByPath: Record<string, AgentThreadSummary[]>,
  path: string,
  threadId: string,
  title: string,
): Record<string, AgentThreadSummary[]> {
  const trimmed = title.trim();
  if (!trimmed) return threadsByPath;
  return updateThread(threadsByPath, path, threadId, { title: trimmed });
}

export function setThreadPinned(
  threadsByPath: Record<string, AgentThreadSummary[]>,
  path: string,
  threadId: string,
  isPinned: boolean,
): Record<string, AgentThreadSummary[]> {
  return updateThread(threadsByPath, path, threadId, { isPinned });
}

export function setThreadArchived(
  threadsByPath: Record<string, AgentThreadSummary[]>,
  path: string,
  threadId: string,
  archived: boolean,
): Record<string, AgentThreadSummary[]> {
  return updateThread(threadsByPath, path, threadId, { archived });
}

export function snoozeThread(
  threadsByPath: Record<string, AgentThreadSummary[]>,
  path: string,
  threadId: string,
  until: number,
): Record<string, AgentThreadSummary[]> {
  return updateThread(threadsByPath, path, threadId, {
    snoozedUntil: until,
    settled: false,
  } as Partial<AgentThreadSummary>);
}

export function settleThread(
  threadsByPath: Record<string, AgentThreadSummary[]>,
  path: string,
  threadId: string,
  settled: boolean,
): Record<string, AgentThreadSummary[]> {
  return updateThread(threadsByPath, path, threadId, {
    settled,
    ...(settled ? { snoozedUntil: null } : {}),
  } as Partial<AgentThreadSummary>);
}

export function sortThreadEntries(
  threads: SnoozableThreadSummary[],
  now: number = Date.now(),
): SnoozableThreadSummary[] {
  const rank = (thread: SnoozableThreadSummary): number => {
    if (thread.isPinned) return 0;
    const snoozedActive = typeof thread.snoozedUntil === "number" && thread.snoozedUntil > now;
    if (snoozedActive) return 2;
    if (thread.settled) return 3;
    return 1;
  };
  return [...threads].sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return b.updatedAt - a.updatedAt;
  });
}

export function deriveThreadTitle(firstUserMessage: string, fallback = "New thread"): string {
  const trimmed = firstUserMessage.trim().replace(/\s+/g, " ");
  if (!trimmed) return fallback;
  return trimmed.length > 60 ? `${trimmed.slice(0, 60).trimEnd()}…` : trimmed;
}

export function threadsForInstance(
  threadsByPath: Record<string, AgentThreadSummary[]>,
  instanceByThreadId: Record<string, string>,
  path: string,
  instanceId: string,
): AgentThreadSummary[] {
  const threads = threadsByPath[path];
  if (!threads) return [];
  return threads.filter((thread) => instanceByThreadId[thread.id] === instanceId);
}

export function forkThreadEntry(
  catalog: AgentSessionCatalog,
  path: string,
  sourceThreadId: string,
  newNativeSessionId: string,
  upToMessageUuid: string,
): AgentSessionCatalog {
  const threads = catalog.threadsByPath[path] ?? [];
  const source = threads.find((thread) => thread.id === sourceThreadId);
  if (!source) return catalog;
  const now = Date.now();
  const forked: ForkableThreadSummary = {
    ...source,
    id: newNativeSessionId,
    createdAt: now,
    updatedAt: now,
    isPinned: false,
    archived: false,
    forkedFrom: { threadId: sourceThreadId, upToMessageUuid },
  };
  const sourceInstanceId = catalog.instanceByThreadId?.[sourceThreadId];
  const instanceByThreadId = sourceInstanceId
    ? { ...catalog.instanceByThreadId, [newNativeSessionId]: sourceInstanceId }
    : catalog.instanceByThreadId;
  return {
    ...catalog,
    threadsByPath: {
      ...catalog.threadsByPath,
      [path]: [...threads, forked],
    },
    ...(instanceByThreadId ? { instanceByThreadId } : {}),
  };
}

export function markThreadEphemeral(
  threadsByPath: Record<string, AgentThreadSummary[]>,
  path: string,
  threadId: string,
  ephemeral: boolean,
): Record<string, AgentThreadSummary[]> {
  return updateThread(threadsByPath, path, threadId, { ephemeral } as Partial<AgentThreadSummary>);
}

interface CatalogThreadRefs {
  threadsByPath: Record<string, AgentThreadSummary[]>;
  activeThreadByPath: Record<string, string | null>;
  instanceByThreadId?: Record<string, string>;
}

function removeThreadReferences<T extends CatalogThreadRefs>(
  catalog: T,
  path: string,
  threadId: string,
): T {
  const threads = catalog.threadsByPath[path];
  if (!threads || !threads.some((thread) => thread.id === threadId)) return catalog;
  const threadsByPath = {
    ...catalog.threadsByPath,
    [path]: threads.filter((thread) => thread.id !== threadId),
  };
  const activeThreadByPath = catalog.activeThreadByPath[path] === threadId
    ? { ...catalog.activeThreadByPath, [path]: null }
    : catalog.activeThreadByPath;
  let instanceByThreadId = catalog.instanceByThreadId;
  if (instanceByThreadId && threadId in instanceByThreadId) {
    instanceByThreadId = { ...instanceByThreadId };
    delete instanceByThreadId[threadId];
  }
  return { ...catalog, threadsByPath, activeThreadByPath, instanceByThreadId };
}

function stripEphemeralThreads(catalog: AgentSessionCatalog): AgentSessionCatalog {
  let result = catalog;
  for (const [path, threads] of Object.entries(catalog.threadsByPath)) {
    for (const thread of threads) {
      if ((thread as ForkableThreadSummary).ephemeral === true) {
        result = removeThreadReferences(result, path, thread.id);
      }
    }
  }
  return result;
}

export interface PurgeThreadDataResult {
  removedFromCatalog: boolean;
  removedResumeCursor: boolean;
  removedDrafts: number;
}

export async function purgeThreadData(
  path: string,
  threadId: string,
  configDir?: string,
): Promise<PurgeThreadDataResult> {
  const catalog = loadAgentSessionCatalog();
  const threadsByPath = catalog.threadsByPath ?? {};
  const threads = threadsByPath[path] ?? [];
  const target = threads.find((thread) => thread.id === threadId);
  const removedFromCatalog = target !== undefined;
  if (removedFromCatalog) {
    const refs = removeThreadReferences(
      {
        threadsByPath,
        activeThreadByPath: catalog.activeThreadByPath ?? {},
        instanceByThreadId: catalog.instanceByThreadId,
      },
      path,
      threadId,
    );
    kvSet(STORAGE_KEY, JSON.stringify({ state: { ...catalog, ...refs }, version: 1 }));
  }

  if (pendingCatalog) {
    pendingCatalog = removeThreadReferences(pendingCatalog, path, threadId);
  }

  const cursors = loadResumeCursors();
  const removedResumeCursor = threadId in cursors;
  if (removedResumeCursor) {
    const nextCursors = { ...cursors };
    delete nextCursors[threadId];
    saveResumeCursors(nextCursors);
  }

  let removedDrafts = 0;
  try {
    const draftsRaw = kvGet(AGENT_COMPOSER_DRAFTS_KEY);
    if (draftsRaw) {
      const drafts = JSON.parse(draftsRaw) as Record<string, unknown>;
      const nextDrafts: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(drafts)) {
        if (key === threadId || key.endsWith(` ${threadId}`)) {
          removedDrafts += 1;
          continue;
        }
        nextDrafts[key] = value;
      }
      if (removedDrafts > 0) kvSet(AGENT_COMPOSER_DRAFTS_KEY, JSON.stringify(nextDrafts));
    }
  } catch {
    removedDrafts = 0;
  }

  if (target?.modelProvider === "anthropic") {
    await invoke("claude_delete_session", { path, sessionId: threadId, configDir });
  }

  return { removedFromCatalog, removedResumeCursor, removedDrafts };
}

export function loadAgentSessionCatalog(): Partial<AgentSessionCatalog> {
  try {
    const raw = kvGet(STORAGE_KEY);
    return raw ? catalogFromUnknown(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function scheduleAgentSessionCatalogSave(catalog: AgentSessionCatalog): void {
  pendingCatalog = catalog;
  if (saveTimer) return;
  saveTimer = setTimeout(flushAgentSessionCatalog, SAVE_DELAY_MS);
}

export function flushAgentSessionCatalog(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const catalog = pendingCatalog;
  pendingCatalog = null;
  if (!catalog) return;
  try {
    const persisted = stripEphemeralThreads(catalog);
    kvSet(STORAGE_KEY, JSON.stringify({ state: persisted, version: 1 }));
  } catch {
    return;
  }
}
