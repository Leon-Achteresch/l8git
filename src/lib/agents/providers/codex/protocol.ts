import type {
  AgentApprovalPolicy,
  AgentCollaborationMode,
  AgentItem,
  AgentPersonality,
  AgentRealtimeVoice,
  AgentReasoningEffort,
  AgentTurnStatus,
} from "@/lib/agents/types";

export interface CodexModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  isDefault: boolean;
  defaultReasoningEffort: AgentReasoningEffort;
  inputModalities: string[];
  supportedReasoningEfforts: Array<{
    reasoningEffort: AgentReasoningEffort;
    description: string;
  }>;
  serviceTiers: Array<{ id: string; name: string; description: string }>;
  defaultServiceTier: string | null;
  supportsPersonality: boolean;
}

export interface CodexThread {
  id: string;
  preview: string;
  name: string | null;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  status: string | { type?: string };
  modelProvider: string;
  isPinned: boolean;
  turns: CodexTurn[];
}

export interface CodexTurn {
  id: string;
  items: AgentItem[];
  status: AgentTurnStatus;
  error: { message?: string } | null;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
}

export interface CodexThreadRuntime {
  thread: CodexThread;
  model: string;
  modelProvider: string;
  cwd: string;
  approvalPolicy: AgentApprovalPolicy;
  sandbox: { type: string };
  reasoningEffort: AgentReasoningEffort | null;
}

export interface CodexUserInputText {
  type: "text";
  text: string;
  text_elements: [];
}

export interface CodexUserInputImage {
  type: "localImage";
  path: string;
}

export interface CodexUserInputAudio {
  type: "localAudio";
  path: string;
}

export interface CodexUserInputResource {
  type: "skill" | "mention";
  name: string;
  path: string;
}

export type CodexUserInput =
  | CodexUserInputText
  | CodexUserInputImage
  | CodexUserInputAudio
  | CodexUserInputResource;

export interface CodexThreadStartOptions {
  cwd: string;
  model?: string;
  approvalPolicy?: AgentApprovalPolicy;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  serviceTier?: string | null;
  personality?: AgentPersonality | null;
  permissions?: string | null;
}

export interface CodexTurnOptions {
  model?: string;
  effort?: AgentReasoningEffort;
  approvalPolicy?: AgentApprovalPolicy;
  sandboxPolicy?: Record<string, unknown>;
  serviceTier?: string | null;
  personality?: AgentPersonality | null;
  collaborationMode?: {
    mode: AgentCollaborationMode;
    settings: {
      model: string;
      reasoning_effort: AgentReasoningEffort | null;
      developer_instructions: string | null;
    };
  } | null;
  permissions?: string | null;
}

export interface CodexRealtimeAudioChunk {
  data: string;
  sampleRate: number;
  numChannels: number;
  samplesPerChannel: number | null;
  itemId: string | null;
}

export interface CodexRealtimeStartOptions {
  voice?: AgentRealtimeVoice | null;
  outputModality?: "text" | "audio";
}

export interface CodexAccountResponse {
  account: ({ type: string; email?: string | null; planType?: string | null } & Record<string, unknown>) | null;
  requiresOpenaiAuth: boolean;
}

export type CodexLoginResponse =
  | { type: "chatgpt"; loginId: string; authUrl: string }
  | { type: "chatgptDeviceCode"; loginId: string; verificationUrl: string; userCode: string }
  | { type: string; [key: string]: unknown };

export interface CodexRateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export interface CodexRateLimitSnapshot {
  limitId: string | null;
  limitName: string | null;
  primary: CodexRateLimitWindow | null;
  secondary: CodexRateLimitWindow | null;
  planType: string | null;
  [key: string]: unknown;
}

export interface CodexRateLimitsResponse {
  rateLimits: CodexRateLimitSnapshot;
  rateLimitsByLimitId: Record<string, CodexRateLimitSnapshot> | null;
}

export interface CodexModelListResponse {
  data: CodexModel[];
  nextCursor: string | null;
}

export function codexSandboxMode(type: string): "read-only" | "workspace-write" | "danger-full-access" {
  if (type === "readOnly") return "read-only";
  if (type === "dangerFullAccess") return "danger-full-access";
  return "workspace-write";
}

export function codexSandboxPolicy(mode: "read-only" | "workspace-write" | "danger-full-access"): Record<string, unknown> {
  if (mode === "read-only") return { type: "readOnly", networkAccess: false };
  if (mode === "danger-full-access") return { type: "dangerFullAccess" };
  return {
    type: "workspaceWrite",
    writableRoots: [],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}
