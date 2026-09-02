import { invoke } from "@tauri-apps/api/core";

import type { AgentRateLimitWindow } from "@/lib/agents/types";

export const SESSION_WINDOW_MINUTES = 300;
export const WEEKLY_WINDOW_MINUTES = 10_080;
export const RATE_LIMIT_POLL_MS = 15 * 60 * 1000;

export type ClaudeRateLimitStatus = "idle" | "ok" | "error" | "unavailable";

export interface ClaudeRateLimits {
  session: AgentRateLimitWindow | null;
  weekly: AgentRateLimitWindow | null;
  updatedAt: number;
  error: string | null;
  status: ClaudeRateLimitStatus;
}

interface ClaudeUsageFetch {
  status: string;
  httpStatus?: number | null;
  body?: string | null;
  error?: string | null;
}

export function idleClaudeRateLimits(): ClaudeRateLimits {
  return { session: null, weekly: null, updatedAt: 0, error: null, status: "idle" };
}

export function clampUsedPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function formatWindowLabel(windowMinutes: number): string {
  if (windowMinutes === WEEKLY_WINDOW_MINUTES) return "wk";
  if (windowMinutes === SESSION_WINDOW_MINUTES) return "5h";
  if (windowMinutes < 60) return `${windowMinutes}m`;
  if (windowMinutes % (60 * 24) === 0) return `${windowMinutes / (60 * 24)}d`;
  if (windowMinutes % 60 === 0) return `${windowMinutes / 60}h`;
  return `${windowMinutes}m`;
}

export function formatResetDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMins = Math.floor(ms / 60_000);
  if (totalMins < 60) return `${totalMins}m`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remaining = hours % 24;
    return remaining > 0 ? `${days}d ${remaining}h` : `${days}d`;
  }
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function parseResetTimestamp(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric > 10_000_000_000 ? Math.round(numeric / 1000) : Math.round(numeric);
}

function mapWindow(raw: unknown, windowMinutes: number): AgentRateLimitWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const rawUsed =
    record.used_percentage ?? record.usedPercent ?? record.utilization ?? null;
  const used = typeof rawUsed === "number" ? rawUsed : Number(rawUsed);
  if (!Number.isFinite(used)) return null;
  return {
    usedPercent: clampUsedPercent(used),
    windowDurationMins: windowMinutes,
    resetsAt: parseResetTimestamp(record.resets_at ?? record.resetsAt),
  };
}

export function parseClaudeUsage(body: string): ClaudeRateLimits {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: "Claude usage response was not JSON",
      status: "error",
    };
  }
  const record = (parsed ?? {}) as Record<string, unknown>;
  return {
    session: mapWindow(record.five_hour, SESSION_WINDOW_MINUTES),
    weekly: mapWindow(record.seven_day, WEEKLY_WINDOW_MINUTES),
    updatedAt: Date.now(),
    error: null,
    status: "ok",
  };
}

export async function fetchClaudeRateLimits(): Promise<ClaudeRateLimits> {
  try {
    const result = await invoke<ClaudeUsageFetch>("fetch_claude_usage");
    if (result.status === "ok" && result.body) return parseClaudeUsage(result.body);
    return {
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: result.error?.trim() || "Claude usage unavailable",
      status: result.status === "unavailable" ? "unavailable" : "error",
    };
  } catch (error) {
    return {
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
      status: "error",
    };
  }
}
