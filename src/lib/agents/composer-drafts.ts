import type { AgentAttachment } from "@/lib/agents/types";
import { kvGet, kvSet } from "@/lib/platform/kv";
import { onAppSuspend } from "@/lib/platform/lifecycle";
import { AGENT_COMPOSER_DRAFTS_KEY as STORAGE_KEY } from "@/lib/agents/storage-keys";

export interface AgentComposerDraft {
  text: string;
  attachments: AgentAttachment[];
}

type DraftMap = Record<string, AgentComposerDraft>;
let cachedDrafts: DraftMap | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function readDrafts(): DraftMap {
  if (cachedDrafts) return cachedDrafts;
  try {
    const value = JSON.parse(kvGet(STORAGE_KEY) ?? "{}");
    cachedDrafts = typeof value === "object" && value !== null ? value as DraftMap : {};
  } catch {
    cachedDrafts = {};
  }
  return cachedDrafts;
}

export function resetAgentComposerDraftsCache(): void {
  cachedDrafts = null;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}

function flushDrafts(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!cachedDrafts) return;
  try {
    kvSet(STORAGE_KEY, JSON.stringify(cachedDrafts));
  } catch {
    return;
  }
}

function safeDraft(value: AgentComposerDraft | undefined): AgentComposerDraft {
  if (!value) return { text: "", attachments: [] };
  return {
    text: typeof value.text === "string" ? value.text : "",
    attachments: Array.isArray(value.attachments)
      ? value.attachments.filter((item) =>
          typeof item === "object" &&
          item !== null &&
          typeof item.path === "string" &&
          typeof item.name === "string" &&
          ["localImage", "localAudio", "mention", "skill"].includes(item.type),
        )
      : [],
  };
}

export function agentComposerDraftKey(
  host: string,
  instanceId: string,
  threadId: string | null,
): string {
  return `${host}\u0000${instanceId}\u0000${threadId ?? "__new"}`;
}

function legacyAgentComposerDraftKey(host: string, threadId: string | null): string {
  return `${host}\u0000${threadId ?? "__new"}`;
}

export function loadAgentComposerDraft(
  host: string,
  instanceId: string,
  threadId: string | null,
): AgentComposerDraft {
  const drafts = readDrafts();
  const key = agentComposerDraftKey(host, instanceId, threadId);
  if (drafts[key]) return safeDraft(drafts[key]);
  const legacyKey = legacyAgentComposerDraftKey(host, threadId);
  const legacy = drafts[legacyKey];
  if (legacy) {
    const migrated = safeDraft(legacy);
    drafts[key] = migrated;
    delete drafts[legacyKey];
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushDrafts, 400);
    return migrated;
  }
  return safeDraft(undefined);
}

export function saveAgentComposerDraft(
  host: string,
  instanceId: string,
  threadId: string | null,
  draft: AgentComposerDraft,
): void {
  const drafts = readDrafts();
  const key = agentComposerDraftKey(host, instanceId, threadId);
  if (!draft.text && draft.attachments.length === 0) delete drafts[key];
  else drafts[key] = draft;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushDrafts, 400);
}

onAppSuspend(flushDrafts);
