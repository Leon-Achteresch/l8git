import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import { platformStorage } from "@/lib/platform/kv";

export function readableCommitDraftJson(raw: string | null): string | null {
  if (raw === null) return null;
  try { JSON.parse(raw); return raw; } catch { return null; }
}

/** Corrupt JSON must finish hydration so the composer remains usable. */
export const commitDraftStorage: StateStorage = {
  ...platformStorage,
  getItem: (name) => {
    try {
      const value = platformStorage.getItem(name);
      return typeof value === "string" || value === null
        ? readableCommitDraftJson(value)
        : Promise.resolve(value).then(readableCommitDraftJson).catch(() => null);
    } catch { return null; }
  },
};

export type CommitDraft = {
  message: string;
  amend?: { hash: string; commitMessage: string; originalMessage: string };
  /** Persist the manual draft while AI streams so a process exit cannot lose it. */
  aiBackup?: string;
};

export function sanitizeCommitDrafts(value: unknown): Record<string, CommitDraft> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, CommitDraft> = {};
  for (const [path, candidate] of Object.entries(value)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const draft = candidate as Partial<CommitDraft>;
    if (typeof draft.message !== "string") continue;
    const next: CommitDraft = { message: typeof draft.aiBackup === "string" ? draft.aiBackup : draft.message };
    const amend = draft.amend;
    if (amend && typeof amend.hash === "string" && /^[\da-f]+$/i.test(amend.hash) && typeof amend.commitMessage === "string" && typeof amend.originalMessage === "string") {
      next.amend = { hash: amend.hash, commitMessage: amend.commitMessage, originalMessage: amend.originalMessage };
    }
    Object.defineProperty(result, path, { value: next, enumerable: true, configurable: true, writable: true });
  }
  return result;
}

type CommitMessagePrefs = {
  guidanceExpanded: boolean;
  drafts: Record<string, CommitDraft>;
  setGuidanceExpanded: (expanded: boolean) => void;
  seedDraft: (path: string, template: string) => void;
  setMessage: (path: string, message: string | ((current: string) => string)) => void;
  beginAmend: (path: string, hash: string, commitMessage: string) => void;
  cancelAmend: (path: string) => void;
  completeCommit: (path: string, template: string) => void;
  beginAiDraft: (path: string) => void;
  completeAiDraft: (path: string, message: string) => void;
  cancelAiDraft: (path: string) => void;
};

export const useCommitMessagePrefs = create<CommitMessagePrefs>()(
  persist(
    (set) => ({
      guidanceExpanded: false,
      drafts: {},
      setGuidanceExpanded: (guidanceExpanded) => set({ guidanceExpanded }),
      seedDraft: (path, template) => set((s) => {
        if (Object.prototype.hasOwnProperty.call(s.drafts, path)) return s;
        return { drafts: { ...s.drafts, [path]: { message: template } } };
      }),
      setMessage: (path, value) => set((s) => {
        const previous = s.drafts[path] ?? { message: "" };
        const message = typeof value === "function" ? value(previous.message) : value;
        if (message === previous.message && Object.prototype.hasOwnProperty.call(s.drafts, path)) return s;
        return { drafts: { ...s.drafts, [path]: { ...previous, message } } };
      }),
      beginAmend: (path, hash, commitMessage) => set((s) => {
        const previous = s.drafts[path];
        return { drafts: { ...s.drafts, [path]: {
          message: commitMessage,
          amend: { hash, commitMessage, originalMessage: previous?.amend?.originalMessage ?? previous?.message ?? "" },
        } } };
      }),
      cancelAmend: (path) => set((s) => {
        const draft = s.drafts[path];
        if (!draft?.amend) return s;
        return { drafts: { ...s.drafts, [path]: { message: draft.amend.originalMessage } } };
      }),
      completeCommit: (path, template) => set((s) => ({ drafts: {
        ...s.drafts,
        [path]: { message: s.drafts[path]?.amend?.originalMessage ?? template },
      } })),
      beginAiDraft: (path) => set((s) => {
        const draft = s.drafts[path] ?? { message: "" };
        if (typeof draft.aiBackup === "string") return s;
        return { drafts: { ...s.drafts, [path]: { ...draft, aiBackup: draft.message } } };
      }),
      completeAiDraft: (path, message) => set((s) => {
        const { aiBackup: _backup, ...draft } = s.drafts[path] ?? { message: "" };
        return { drafts: { ...s.drafts, [path]: { ...draft, message } } };
      }),
      cancelAiDraft: (path) => set((s) => {
        const draft = s.drafts[path];
        if (typeof draft?.aiBackup !== "string") return s;
        const { aiBackup, ...rest } = draft;
        return { drafts: { ...s.drafts, [path]: { ...rest, message: aiBackup } } };
      }),
    }),
    {
      name: "l8git-commit-message-prefs",
      storage: createJSONStorage(() => commitDraftStorage),
      partialize: ({ drafts, guidanceExpanded }) => ({ drafts, guidanceExpanded }),
      merge: (persisted, current) => {
        const state = persisted && typeof persisted === "object" ? persisted as Partial<CommitMessagePrefs> : {};
        return { ...current, drafts: sanitizeCommitDrafts(state.drafts), guidanceExpanded: state.guidanceExpanded === true };
      },
    },
  ),
);
