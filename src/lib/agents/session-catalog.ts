import type {
  AgentApprovalPolicy,
  AgentCollaborationMode,
  AgentPersonality,
  AgentRealtimeVoice,
  AgentReasoningEffort,
  AgentSandboxMode,
  AgentThreadSummary,
} from "@/lib/agents/types";

const STORAGE_KEY = "l8git-agent-chat";
const SAVE_DELAY_MS = 350;

export interface AgentSessionCatalog {
  threadsByPath: Record<string, AgentThreadSummary[]>;
  activeThreadByPath: Record<string, string | null>;
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
      } satisfies AgentThreadSummary];
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

function catalogFromUnknown(value: unknown): Partial<AgentSessionCatalog> {
  if (!isRecord(value)) return {};
  const candidate = isRecord(value.state) ? value.state : value;
  const approvals: AgentApprovalPolicy[] = ["untrusted", "on-request", "never"];
  const sandboxes: AgentSandboxMode[] = ["read-only", "workspace-write", "danger-full-access"];
  const personalities: AgentPersonality[] = ["none", "friendly", "pragmatic"];
  const collaborationModes: AgentCollaborationMode[] = ["default", "plan"];
  return {
    threadsByPath: normalizeThreads(candidate.threadsByPath),
    activeThreadByPath: normalizeActiveThreads(candidate.activeThreadByPath),
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

export function loadAgentSessionCatalog(): Partial<AgentSessionCatalog> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
  if (!catalog || typeof localStorage === "undefined") return;
  try {
    // Keep the old Zustand envelope readable so existing preferences migrate
    // without importing any external Codex CLI history.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: catalog, version: 1 }));
  } catch {
    // A full/disabled localStorage must never interrupt an active agent stream.
  }
}
