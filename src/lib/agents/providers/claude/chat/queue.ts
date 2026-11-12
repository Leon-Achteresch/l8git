import { claudeChatStore } from "@/lib/agents/providers/claude/chat-store";
import { type UnknownRecord, clients } from "@/lib/agents/providers/claude/chat/state";

export type SendMode = "steer" | "queue";

export function planSendMode(params: { turnActive: boolean; steerSupported: boolean }): SendMode {
  if (!params.turnActive) return "steer";
  return params.steerSupported ? "steer" : "queue";
}

export interface QueuedMessage {
  id: string;
  threadId: string;
  text: string;
  status: "pending" | "delivered";
  createdAt: number;
}

export const messageQueues = new Map<string, QueuedMessage[]>();

export function queueMessage(threadId: string, id: string, text: string): QueuedMessage {
  const entry: QueuedMessage = { id, threadId, text, status: "pending", createdAt: Date.now() };
  messageQueues.set(threadId, [...(messageQueues.get(threadId) ?? []), entry]);
  return entry;
}

export function listQueuedMessages(threadId: string): QueuedMessage[] {
  return messageQueues.get(threadId) ?? [];
}

export function editQueuedMessage(threadId: string, id: string, text: string): boolean {
  const list = messageQueues.get(threadId);
  if (!list) return false;
  const index = list.findIndex((entry) => entry.id === id && entry.status === "pending");
  if (index === -1) return false;
  const next = [...list];
  next[index] = { ...next[index], text };
  messageQueues.set(threadId, next);
  return true;
}

export function removeQueuedMessage(threadId: string, id: string): boolean {
  const list = messageQueues.get(threadId);
  if (!list) return false;
  const next = list.filter((entry) => entry.id !== id);
  if (next.length === list.length) return false;
  messageQueues.set(threadId, next);
  return true;
}

export function dequeueNextMessage(threadId: string): QueuedMessage | undefined {
  const list = messageQueues.get(threadId);
  if (!list || list.length === 0) return undefined;
  const [next, ...rest] = list;
  messageQueues.set(threadId, rest);
  return { ...next, status: "delivered" };
}

export interface ThreadSuggestion {
  id: string;
  text: string;
  turnId: string;
}

export const threadSuggestions = new Map<string, ThreadSuggestion[]>();

export function extractSuggestionsFromFrame(frame: UnknownRecord, turnId: string): ThreadSuggestion[] {
  const raw = frame.suggestions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((text, index) => ({ id: `${turnId}-${index}`, text, turnId }));
}

export function setThreadSuggestions(threadId: string, suggestions: ThreadSuggestion[]): void {
  threadSuggestions.set(threadId, suggestions);
}

export function getThreadSuggestions(threadId: string): ThreadSuggestion[] {
  return threadSuggestions.get(threadId) ?? [];
}

export function clearThreadSuggestions(threadId: string): void {
  threadSuggestions.delete(threadId);
}

export function selectSuggestion(
  threadId: string,
  suggestionId: string,
  onSelect: (text: string) => void,
): boolean {
  const list = threadSuggestions.get(threadId) ?? [];
  const found = list.find((suggestion) => suggestion.id === suggestionId);
  if (!found) return false;
  onSelect(found.text);
  return true;
}

export type CompactStatus = "compacting" | "done" | "failed";

export function resolveCompactRoute(capability: { status: string }): "native" | "slash-turn" {
  return capability.status === "supported" ? "native" : "slash-turn";
}

function isCompactBoundaryEvent(event: UnknownRecord): boolean {
  if (event.type === "compact_boundary") return true;
  if (event.type === "system" && event.subtype === "compact_boundary") return true;
  return false;
}

export function compactStatusFromEvent(event: UnknownRecord): CompactStatus | null {
  if (!isCompactBoundaryEvent(event)) return null;
  const error = event.error;
  if (typeof error === "string" && error.length > 0) return "failed";
  return "done";
}

export interface CompactionRequestResult {
  status: CompactStatus;
  route: ReturnType<typeof resolveCompactRoute>;
}

export async function requestThreadCompaction(
  threadId: string,
  capability: { status: string },
): Promise<CompactionRequestResult> {
  const route = resolveCompactRoute(capability);
  const conversation = claudeChatStore.getState().conversations[threadId];
  if (conversation?.activeTurnId) return { status: "failed", route };
  const client = clients.get(threadId);
  if (!client) return { status: "failed", route };
  try {
    await client.sendPrompt("/compact");
    return { status: "compacting", route };
  } catch {
    return { status: "failed", route };
  }
}
