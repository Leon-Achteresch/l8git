import { kvGet, kvSet } from "@/lib/platform/kv";
import { AGENT_PROMPT_HISTORY_KEY as STORAGE_KEY } from "@/lib/agents/storage-keys";

export const PROMPT_HISTORY_LIMIT = 50;

type HistoryMap = Record<string, string[]>;
type CursorMap = Record<string, { index: number; draft: string }>;

let cachedHistory: HistoryMap | null = null;
const cursors: CursorMap = {};

function readHistory(): HistoryMap {
  if (cachedHistory) return cachedHistory;
  try {
    const value = JSON.parse(kvGet(STORAGE_KEY) ?? "{}");
    cachedHistory = typeof value === "object" && value !== null ? (value as HistoryMap) : {};
  } catch {
    cachedHistory = {};
  }
  return cachedHistory;
}

function persist(): void {
  if (!cachedHistory) return;
  try {
    kvSet(STORAGE_KEY, JSON.stringify(cachedHistory));
  } catch {
    return;
  }
}

export function resetPromptHistoryCache(): void {
  cachedHistory = null;
  for (const key of Object.keys(cursors)) delete cursors[key];
}

export function pushPrompt(threadKey: string, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const history = readHistory();
  const list = history[threadKey] ?? [];
  if (list[list.length - 1] !== trimmed) list.push(trimmed);
  history[threadKey] = list.slice(-PROMPT_HISTORY_LIMIT);
  persist();
  delete cursors[threadKey];
}

export function listPromptHistory(threadKey: string): string[] {
  return [...(readHistory()[threadKey] ?? [])];
}

export type PromptHistoryDirection = "up" | "down";

export function navigatePromptHistory(
  threadKey: string,
  direction: PromptHistoryDirection,
  draft: string,
): string | null {
  const list = readHistory()[threadKey] ?? [];
  if (list.length === 0) return null;

  const cursor = cursors[threadKey];
  if (direction === "up") {
    if (!cursor) {
      const index = list.length - 1;
      cursors[threadKey] = { index, draft };
      return list[index] ?? null;
    }
    const nextIndex = cursor.index - 1;
    if (nextIndex < 0) return null;
    cursor.index = nextIndex;
    return list[nextIndex] ?? null;
  }

  if (!cursor) return null;
  const nextIndex = cursor.index + 1;
  if (nextIndex >= list.length) {
    const restored = cursor.draft;
    delete cursors[threadKey];
    return restored;
  }
  cursor.index = nextIndex;
  return list[nextIndex] ?? null;
}

export function resetPromptHistoryCursor(threadKey: string): void {
  delete cursors[threadKey];
}
