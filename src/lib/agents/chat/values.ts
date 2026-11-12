import { formatBackendError } from '@/lib/backend-error';
import type { AgentThreadSummary } from "@/lib/agents/types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function errorMessage(error: unknown): string {
  return formatBackendError(error);
}

export function sortThreadSummaries(threads: AgentThreadSummary[]): AgentThreadSummary[] {
  return [...threads].sort(
    (a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt,
  );
}
