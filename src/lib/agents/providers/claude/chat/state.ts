import { kvGet, kvSet } from "@/lib/platform/kv";
import {
  CLAUDE_SESSION_PREFS_KEY as SESSION_PREFS_KEY,
  CLAUDE_SETTINGS_KEY,
} from "@/lib/agents/storage-keys";
import type { AgentChatState } from "@/lib/agents/chat-store";
import { loadResumeCursors, saveResumeCursors, setResumeCursor } from "@/lib/agents/resume-cursor";
import { type RateLimitBucketMap } from "@/lib/agents/rate-limits";
import { ClaudeClient } from "@/lib/agents/providers/claude/client";
import type { AgentHook, AgentMcpServer, AgentSkill, ThreadId } from "@/lib/agents/types";

export interface ClaudeSessionSummary {
  id: string;
  path: string;
  title: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  model?: string | null;
  permissionMode?: string | null;
  additions?: number;
  deletions?: number;
}

export interface ClaudeSessionTranscript {
  summary: ClaudeSessionSummary;
  entries: Array<Record<string, unknown>>;
}

export type UnknownRecord = Record<string, unknown>;

export const clients = new Map<string, ClaudeClient>();
export const __claudeClientsForTests = clients;
export const clientLastUsed = new Map<string, number>();
export const clientConnectPromises = new Map<string, Promise<ClaudeClient>>();
export const persistedSessions = new Set<string>();
export const pendingForkSources = new Map<string, string>();
export const rateLimitBucketsByThread = new Map<string, RateLimitBucketMap>();
export const autoResumeAttemptedTurns = new Set<string>();
export const bookedSubagentUsage = new Set<string>();
export const runtimeState = {
  resumeCursors: loadResumeCursors(),
  surfaceReferences: 0,
  surfaceReleaseTimer: null as ReturnType<typeof setTimeout> | null,
  streamFlushTimer: null as ReturnType<typeof setTimeout> | null,
};
export const eventSequenceByThread = new Map<string, number>();

function nextEventSequence(threadId: string): number {
  const seeded = eventSequenceByThread.get(threadId) ?? runtimeState.resumeCursors[threadId]?.lastSequence ?? 0;
  const next = seeded + 1;
  eventSequenceByThread.set(threadId, next);
  return next;
}

export function persistResumeCursor(threadId: string, nativeSessionId: string) {
  runtimeState.resumeCursors = setResumeCursor(runtimeState.resumeCursors, threadId as unknown as ThreadId, {
    nativeSessionId,
    lastSequence: nextEventSequence(threadId),
    updatedAt: Date.now(),
  });
  saveResumeCursors(runtimeState.resumeCursors);
}
export const skillsByPath = new Map<string, AgentSkill[]>();
export const hooksByPath = new Map<string, AgentHook[]>();
export const commandsByPath = new Map<string, Array<{ name: string; description: string; argumentHint: string }>>();
export const agentsByPath = new Map<string, Array<{ name: string; description: string }>>();
export const mcpByPath = new Map<string, AgentMcpServer[]>();
export const capabilityLastUsedByPath = new Map<string, number>();
export const capabilityPromises = new Map<string, Promise<void>>();
/* Repos whose model catalog we already tried to warm — see loadPermissionProfiles. */
export const catalogWarmups = new Set<string>();
export const transcriptPromises = new Map<string, Promise<ClaudeSessionTranscript>>();
export const threadListPromises = new Map<string, Promise<ClaudeSessionSummary[]>>();
export const threadListCache = new Map<string, { expiresAt: number; data: ClaudeSessionSummary[] }>();
export const repoFileCache = new Map<string, {
  expiresAt: number;
  data: Array<{ path: string; lowerPath: string; fileName: string }>;
}>();
export const repoFilePromises = new Map<string, Promise<Array<{ path: string; lowerPath: string; fileName: string }>>>();
export const conversationLastUsed = new Map<string, number>();
export const HIDDEN_CLIENT_IDLE_MS = 60_000;

export const STREAM_FLUSH_MS = 100;
export const THREAD_LIST_CACHE_MS = 10_000;
export const REPO_FILE_CACHE_MS = 30_000;
export const MAX_REPO_FILE_CACHES = 3;
export const MAX_CAPABILITY_PATHS = 8;
export const MAX_THREAD_LIST_CACHES = 8;
export const MAX_WARM_CLIENTS = 2;
export const MAX_CACHED_CONVERSATIONS = 6;
export const streamEventsByThread = new Map<string, UnknownRecord[]>();

export const sessionPrefs: { pinned: Set<string>; archived: Set<string> } = (() => {
  try {
    const value = JSON.parse(kvGet(SESSION_PREFS_KEY) ?? "{}") as { pinned?: string[]; archived?: string[] };
    return { pinned: new Set(value.pinned ?? []), archived: new Set(value.archived ?? []) };
  } catch {
    return { pinned: new Set<string>(), archived: new Set<string>() };
  }
})();

export function saveSessionPrefs() {
  kvSet(SESSION_PREFS_KEY, JSON.stringify({
    pinned: [...sessionPrefs.pinned],
    archived: [...sessionPrefs.archived],
  }));
}

export const persistedSettings = (() => {
  try {
    const value = JSON.parse(kvGet(CLAUDE_SETTINGS_KEY) ?? "{}") as UnknownRecord;
    return {
      model: typeof value.model === "string" ? value.model : null,
      reasoningEffort: typeof value.reasoningEffort === "string" ? value.reasoningEffort : "high",
      collaborationMode: value.collaborationMode === "plan" ? "plan" as const : "default" as const,
      permissionProfile: typeof value.permissionProfile === "string" || value.permissionProfile === null ? value.permissionProfile : "default",
      approvalPolicy: value.approvalPolicy === "never" || value.approvalPolicy === "untrusted" ? value.approvalPolicy : "on-request" as const,
      sandboxMode: value.sandboxMode === "read-only" || value.sandboxMode === "danger-full-access" ? value.sandboxMode : "workspace-write" as const,
    };
  } catch {
    return {} as Partial<AgentChatState>;
  }
})();

export const permissionProfiles = [
  { id: "default", description: "Claude asks before sensitive actions.", allowed: true },
  { id: "acceptEdits", description: "Automatically accept file edits.", allowed: true },
  { id: "dontAsk", description: "Deny actions that are not pre-approved.", allowed: true },
  { id: "plan", description: "Read-only planning mode.", allowed: true },
  { id: "bypassPermissions", description: "Skip all permission checks.", allowed: true },
  { id: "auto", description: "Claude automatically chooses safe actions.", allowed: true },
];
