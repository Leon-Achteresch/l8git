export type AgentRunStatus = "running" | "done" | "failed" | "queued";

export type AgentRunAction = {
  kind: string;
  target?: string;
};

export type AgentRun = {
  id: string;
  name: string;
  status: AgentRunStatus;
  summary?: string;
  action?: AgentRunAction;
  detail?: {
    title?: string;
    description?: string;
    fileCount?: number;
    durationLabel?: string;
    actions?: AgentRunAction[];
  };
};

export type AgentRunGroup = {
  label?: string;
  rootLabel?: string;
  actionCount?: number;
  durationLabel?: string;
  runs: AgentRun[];
};
