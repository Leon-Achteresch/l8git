import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleMinus,
  CircleSlash,
  CircleX,
  Clock,
  LoaderCircle,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import type { PillTone } from '~/components/shared/status-pill';

export type RemoteCiCheck = {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
  details_url?: string | null;
  ci_kind?: string | null;
  key?: string | null;
  head_sha?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  description?: string | null;
  output_title?: string | null;
  output_summary?: string | null;
  output_text?: string | null;
  app_name?: string | null;
  app_slug?: string | null;
  check_suite_id?: string | null;
  check_run_id?: string | null;
  external_id?: string | null;
  annotations_count?: number | null;
  status_uuid?: string | null;
};

export type RepoCommitChecks = {
  head_sha: string;
  checks: RemoteCiCheck[];
};

export type WorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  workflow_id: number;
  head_branch: string | null;
  head_sha: string;
  run_number: number;
  event: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  run_started_at: string | null;
  actor_login: string | null;
  actor_avatar: string | null;
  display_title: string | null;
  run_attempt: number | null;
  workflow_path: string | null;
};

export type WorkflowStep = {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
};

export type WorkflowJob = {
  id: number;
  run_id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string | null;
  steps: WorkflowStep[];
};

export type CiState =
  | 'success'
  | 'failure'
  | 'running'
  | 'queued'
  | 'cancelled'
  | 'skipped'
  | 'neutral'
  | 'unknown';

const SUCCESS = new Set(['success', 'successful', 'passed', 'completed', 'fixed']);
const FAILURE = new Set([
  'failure',
  'failed',
  'timed_out',
  'error',
  'action_required',
  'startup_failure',
]);
const RUNNING = new Set(['in_progress', 'inprogress', 'running', 'requested']);
const QUEUED = new Set(['queued', 'pending', 'waiting', 'blocked']);
const CANCELLED = new Set(['cancelled', 'canceled', 'stopped']);
const SKIPPED = new Set(['skipped', 'stale']);

export function ciState(status: string | null | undefined, conclusion?: string | null): CiState {
  const raw = (conclusion ?? status ?? '').trim().toLowerCase();
  if (raw.length === 0) {
    return 'unknown';
  }
  if (SUCCESS.has(raw)) {
    return 'success';
  }
  if (FAILURE.has(raw)) {
    return 'failure';
  }
  if (RUNNING.has(raw)) {
    return 'running';
  }
  if (QUEUED.has(raw)) {
    return 'queued';
  }
  if (CANCELLED.has(raw)) {
    return 'cancelled';
  }
  if (SKIPPED.has(raw)) {
    return 'skipped';
  }
  if (raw === 'neutral') {
    return 'neutral';
  }
  return 'unknown';
}

export const CI_TONE: Record<CiState, PillTone> = {
  success: 'added',
  failure: 'removed',
  running: 'info',
  queued: 'warning',
  cancelled: 'neutral',
  skipped: 'neutral',
  neutral: 'neutral',
  unknown: 'neutral',
};

export const CI_ICON: Record<CiState, LucideIcon> = {
  success: CircleCheck,
  failure: CircleX,
  running: LoaderCircle,
  queued: Clock,
  cancelled: CircleSlash,
  skipped: CircleMinus,
  neutral: CircleDot,
  unknown: CircleDashed,
};

export const CI_TEXT: Record<CiState, string> = {
  success: 'text-git-added',
  failure: 'text-git-removed',
  running: 'text-git-branch',
  queued: 'text-git-modified',
  cancelled: 'text-muted-foreground',
  skipped: 'text-muted-foreground',
  neutral: 'text-muted-foreground',
  unknown: 'text-muted-foreground',
};

export const CI_LABEL: Record<CiState, string> = {
  success: 'Passed',
  failure: 'Failed',
  running: 'Running',
  queued: 'Queued',
  cancelled: 'Cancelled',
  skipped: 'Skipped',
  neutral: 'Neutral',
  unknown: 'Unknown',
};

export function ciStateLabel(status: string | null | undefined, conclusion?: string | null): string {
  const state = ciState(status, conclusion);
  if (state !== 'unknown') {
    return CI_LABEL[state];
  }
  const raw = (conclusion ?? status ?? '').trim();
  return raw.length > 0 ? raw.replace(/_/g, ' ') : CI_LABEL.unknown;
}

export function isCiActive(state: CiState): boolean {
  return state === 'running' || state === 'queued';
}

export function formatDuration(
  start: string | null | undefined,
  end: string | null | undefined
): string | null {
  if (!start || !end) {
    return null;
  }
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return null;
  }
  const seconds = Math.floor((to - from) / 1000);
  if (seconds < 0) {
    return null;
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function runDuration(run: WorkflowRun): string | null {
  return formatDuration(run.run_started_at ?? run.created_at, run.updated_at);
}

export function workflowFileName(workflowPath: string | null | undefined): string | null {
  if (!workflowPath) {
    return null;
  }
  return workflowPath.split('@')[0].split('/').pop() ?? null;
}

export function summarizeChecks(
  checks: readonly { status: string; conclusion: string | null }[]
): Record<CiState, number> {
  const totals: Record<CiState, number> = {
    success: 0,
    failure: 0,
    running: 0,
    queued: 0,
    cancelled: 0,
    skipped: 0,
    neutral: 0,
    unknown: 0,
  };
  for (const check of checks) {
    totals[ciState(check.status, check.conclusion)] += 1;
  }
  return totals;
}
