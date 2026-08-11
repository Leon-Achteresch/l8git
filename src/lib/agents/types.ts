import type { ComponentType, ReactNode } from "react";

import type { RpcId } from "@/lib/agents/rpc-client";

export type AgentConnectionStatus = "idle" | "connecting" | "ready" | "error";
export type AgentTurnStatus = "inProgress" | "completed" | "interrupted" | "failed";
export type AgentApprovalPolicy = "untrusted" | "on-request" | "never";
export type AgentSandboxMode = "read-only" | "workspace-write" | "danger-full-access";
// The App Server intentionally exposes reasoning effort as an open string.
// Keeping this forward-compatible is important: Max and Ultra appeared after
// the original fixed ladder and custom model providers may add more levels.
export type AgentReasoningEffort = string;
export type AgentPersonality = "none" | "friendly" | "pragmatic";
export type AgentCollaborationMode = "default" | "plan";

export interface AgentCollaborationModeOption {
  name: string;
  mode: AgentCollaborationMode;
  model: string | null;
  reasoningEffort: AgentReasoningEffort | null;
}

export interface AgentPermissionProfile {
  id: string;
  description: string | null;
  allowed: boolean;
}

export type AgentRealtimeVoice =
  | "alloy"
  | "arbor"
  | "ash"
  | "ballad"
  | "breeze"
  | "cedar"
  | "coral"
  | "cove"
  | "echo"
  | "ember"
  | "juniper"
  | "maple"
  | "marin"
  | "sage"
  | "shimmer"
  | "sol"
  | "spruce"
  | "vale"
  | "verse";

export interface AgentRealtimeVoices {
  v1: AgentRealtimeVoice[];
  v2: AgentRealtimeVoice[];
  defaultV1: AgentRealtimeVoice;
  defaultV2: AgentRealtimeVoice;
}

export interface AgentModelOption {
  id: string;
  label: string;
  description: string;
  isDefault: boolean;
  inputModalities: string[];
  reasoningEfforts: Array<{
    value: AgentReasoningEffort;
    label: string;
    description: string;
  }>;
  defaultReasoningEffort: AgentReasoningEffort;
  serviceTiers: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  defaultServiceTier: string | null;
  supportsPersonality: boolean;
}

export interface AgentSkill {
  name: string;
  description: string;
  path: string;
  enabled: boolean;
}

export interface AgentApp {
  id: string;
  name: string;
  description: string | null;
  installUrl: string | null;
  isAccessible: boolean;
  isEnabled: boolean;
}

export interface AgentMcpServer {
  name: string;
  tools: string[];
  authStatus: string;
}

export interface AgentFileMatch {
  root: string;
  path: string;
  fileName: string;
  score: number;
}

export interface AgentHook {
  key: string;
  eventName: string;
  enabled: boolean;
  trustStatus: string;
}

export interface AgentPlugin {
  id: string;
  name: string;
  installed: boolean;
  enabled: boolean;
  availability: string;
}

export type AgentExternalConfigItemType =
  | "AGENTS_MD"
  | "CONFIG"
  | "SKILLS"
  | "PLUGINS"
  | "MCP_SERVER_CONFIG"
  | "SUBAGENTS"
  | "HOOKS"
  | "COMMANDS"
  | "MEMORY"
  | "SESSIONS";

export interface AgentExternalConfigMigrationDetails {
  plugins: Array<{ marketplaceName: string; pluginNames: string[] }>;
  skills: Array<{ name: string }>;
  sessions: Array<{ path: string; cwd: string; title: string | null }>;
  mcpServers: Array<{ name: string }>;
  hooks: Array<{ name: string }>;
  subagents: Array<{ name: string }>;
  commands: Array<{ name: string }>;
  memory?: string[];
}

export interface AgentExternalConfigMigrationItem {
  itemType: AgentExternalConfigItemType;
  description: string;
  cwd: string | null;
  details: AgentExternalConfigMigrationDetails | null;
}

export interface AgentExternalConfigImportSuccess {
  itemType: AgentExternalConfigItemType;
  cwd: string | null;
  source: string | null;
  target: string | null;
  title?: string | null;
}

export interface AgentExternalConfigImportFailure {
  itemType: AgentExternalConfigItemType;
  errorType: string | null;
  subErrorType: string | null;
  failureStage: string;
  message: string;
  cwd: string | null;
  source: string | null;
}

export interface AgentExternalConfigImportTypeResult {
  itemType: AgentExternalConfigItemType;
  successes: AgentExternalConfigImportSuccess[];
  failures: AgentExternalConfigImportFailure[];
}

export interface AgentExternalConfigImportHistory {
  importId: string;
  providerId: string | null;
  completedAtMs: number;
  successes: AgentExternalConfigImportSuccess[];
  failures: AgentExternalConfigImportFailure[];
}

export interface AgentBackgroundTerminal {
  itemId: string;
  processId: string;
  command: string;
  cwd: string;
  osPid: number | null;
  cpuPercent: number | null;
  rssKb: number | null;
}

export interface AgentGoal {
  threadId: string;
  objective: string;
  status: "active" | "paused" | "blocked" | "usageLimited" | "budgetLimited" | "complete";
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
}

export interface AgentAccount {
  type: string;
  email?: string | null;
  planType?: string | null;
}

export interface AgentRateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export interface AgentRateLimits {
  limitId: string | null;
  limitName: string | null;
  primary: AgentRateLimitWindow | null;
  secondary: AgentRateLimitWindow | null;
  planType: string | null;
}

export interface AgentAccountUsage {
  lifetimeTokens: number | null;
  peakDailyTokens: number | null;
  longestRunningTurnSec: number | null;
  currentStreakDays: number | null;
  longestStreakDays: number | null;
}

export interface AgentThreadSummary {
  id: string;
  path: string;
  title: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  status: string;
  modelProvider: string;
  isPinned?: boolean;
  archived?: boolean;
}

export type AgentItem = {
  id: string;
  type: string;
  [key: string]: unknown;
};

export interface AgentTurn {
  id: string;
  items: AgentItem[];
  status: AgentTurnStatus;
  error?: string | null;
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
}

export interface AgentTokenUsage {
  totalTokens: number;
  modelContextWindow: number | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface AgentConversation {
  threadId: string;
  path: string;
  title: string;
  model: string;
  reasoningEffort: AgentReasoningEffort | null;
  serviceTier?: string | null;
  personality?: AgentPersonality | null;
  collaborationMode?: AgentCollaborationMode;
  goal?: AgentGoal | null;
  approvalPolicy: AgentApprovalPolicy;
  sandboxMode: AgentSandboxMode;
  turns: AgentTurn[];
  activeTurnId: string | null;
  tokenUsage?: AgentTokenUsage;
  loading: boolean;
  error: string | null;
}

export interface AgentInputQuestionOption {
  label: string;
  description?: string;
}

export interface AgentInputQuestion {
  id: string;
  header: string;
  question: string;
  isOther?: boolean;
  isSecret?: boolean;
  multiSelect?: boolean;
  options: AgentInputQuestionOption[];
}

export interface AgentPendingRequest {
  sessionId: string;
  requestId: RpcId;
  method: string;
  kind: "command" | "file-change" | "user-input" | "permissions" | "elicitation" | "unknown";
  threadId: string;
  turnId?: string;
  itemId?: string;
  reason?: string;
  command?: string;
  cwd?: string;
  grantRoot?: string;
  questions?: AgentInputQuestion[];
  raw: Record<string, unknown>;
}

interface AgentPathAttachment {
  path: string;
  name: string;
}

export type AgentAttachment =
  | (AgentPathAttachment & { type: "localImage" })
  | (AgentPathAttachment & { type: "localAudio" })
  | (AgentPathAttachment & { type: "mention" })
  | (AgentPathAttachment & { type: "skill" });

export interface AgentProviderDefinition {
  id: string;
  label: string;
  description: string;
  command: string;
  icon: ComponentType<{ className?: string }>;
  surface: "chat" | "terminal";
  capabilities: {
    history: boolean;
    approvals: boolean;
    models: boolean;
    images: boolean;
    tools: boolean;
  };
}

export interface AgentComposerAction {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
}
