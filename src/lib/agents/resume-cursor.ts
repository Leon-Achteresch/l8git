import type { ThreadId } from "@/lib/agents/types";
import { kvGet, kvSet } from "@/lib/platform/kv";
import { AGENT_RESUME_CURSORS_KEY } from "@/lib/agents/storage-keys";

export interface ResumeCursor {
  nativeSessionId: string;
  lastSequence: number;
  updatedAt: number;
}

export type ResumeCursorMap = Record<string, ResumeCursor>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isResumeCursor(value: unknown): value is ResumeCursor {
  return (
    isRecord(value) &&
    typeof value.nativeSessionId === "string" &&
    value.nativeSessionId.length > 0 &&
    typeof value.lastSequence === "number" &&
    Number.isFinite(value.lastSequence) &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt)
  );
}

export function parseResumeCursors(raw: string | null): ResumeCursorMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const result: ResumeCursorMap = {};
    for (const [threadId, cursor] of Object.entries(parsed)) {
      if (isResumeCursor(cursor)) result[threadId] = cursor;
    }
    return result;
  } catch {
    return {};
  }
}

export function loadResumeCursors(): ResumeCursorMap {
  return parseResumeCursors(kvGet(AGENT_RESUME_CURSORS_KEY));
}

export function saveResumeCursors(cursors: ResumeCursorMap): void {
  kvSet(AGENT_RESUME_CURSORS_KEY, JSON.stringify(cursors));
}

export function setResumeCursor(
  cursors: ResumeCursorMap,
  thread: ThreadId,
  cursor: ResumeCursor,
): ResumeCursorMap {
  return { ...cursors, [thread as unknown as string]: cursor };
}

export function getResumeCursor(
  cursors: ResumeCursorMap,
  thread: ThreadId,
): ResumeCursor | null {
  return cursors[thread as unknown as string] ?? null;
}
