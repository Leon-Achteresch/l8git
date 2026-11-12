import type { AgentApp, AgentFileMatch, AgentSkill } from "@/lib/agents/types";
import { loadAgentSessionCatalog } from "@/lib/agents/session-catalog";

let optimisticSequence = 1;
export const renameSequenceByThread = new Map<string, number>();
export const skillsCache = new Map<string, { expiresAt: number; data: AgentSkill[] }>();
export const appsCache = new Map<string, { expiresAt: number; data: AgentApp[] }>();
export const skillsPromises = new Map<string, Promise<AgentSkill[]>>();
export const appsPromises = new Map<string, Promise<AgentApp[]>>();
export const permissionProfilePromises = new Map<string, Promise<void>>();
export const fileSearchCache = new Map<string, { expiresAt: number; data: AgentFileMatch[] }>();
export const fileSearchPromises = new Map<string, Promise<AgentFileMatch[]>>();
export const CODEX_THREAD_LIST_PAGES = 3;

export const persistedCatalog = loadAgentSessionCatalog();
export function optimisticId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${optimisticSequence++}`;
}
