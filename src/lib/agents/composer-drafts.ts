import type { AgentAttachment } from "@/lib/agents/types";

const STORAGE_KEY = "l8git-agent-composer-drafts";

export interface AgentComposerDraft {
  text: string;
  attachments: AgentAttachment[];
}

type DraftMap = Record<string, AgentComposerDraft>;
let cachedDrafts: DraftMap | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function readDrafts(): DraftMap {
  if (cachedDrafts) return cachedDrafts;
  if (typeof localStorage === "undefined") return {};
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    cachedDrafts = typeof value === "object" && value !== null ? value as DraftMap : {};
  } catch {
    cachedDrafts = {};
  }
  return cachedDrafts;
}

function flushDrafts(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!cachedDrafts || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedDrafts));
  } catch {
    // Draft persistence must never interrupt the composer.
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

export function agentComposerDraftKey(path: string, threadId: string | null): string {
  return `${path}\u0000${threadId ?? "__new"}`;
}

export function loadAgentComposerDraft(key: string): AgentComposerDraft {
  return safeDraft(readDrafts()[key]);
}

export function saveAgentComposerDraft(key: string, draft: AgentComposerDraft): void {
  if (typeof localStorage === "undefined") return;
  const drafts = readDrafts();
  if (!draft.text && draft.attachments.length === 0) delete drafts[key];
  else drafts[key] = draft;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushDrafts, 400);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushDrafts);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushDrafts();
  });
}
