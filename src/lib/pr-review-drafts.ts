import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ReviewDraftComment = {
  id: string;
  filePath: string;
  line: number;
  body: string;
  createdAt: string;
  side?: "LEFT" | "RIGHT";
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
  /** Full head SHA the anchor was taken from; pinned submission keeps comments on that commit. */
  commitId?: string;
};

export type ReviewDraftInput = {
  filePath: string;
  line: number;
  body: string;
  side?: "LEFT" | "RIGHT";
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
  commitId?: string;
};

export function draftKey(path: string, number: number): string {
  return `${path}#${number}`;
}

export function sortDrafts(drafts: ReviewDraftComment[]): ReviewDraftComment[] {
  return [...drafts].sort((a, b) => {
    if (a.filePath !== b.filePath) return a.filePath < b.filePath ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}

export function draftsByLine(
  drafts: ReviewDraftComment[],
  filePath: string,
): Map<number, ReviewDraftComment[]> {
  const byLine = new Map<number, ReviewDraftComment[]>();
  for (const draft of drafts) {
    if (draft.filePath !== filePath) continue;
    const bucket = byLine.get(draft.line);
    if (bucket) bucket.push(draft);
    else byLine.set(draft.line, [draft]);
  }
  return byLine;
}

export function toReviewPayload(
  drafts: ReviewDraftComment[],
): { path: string; line: number; body: string; side?: "LEFT" | "RIGHT"; start_line?: number; start_side?: "LEFT" | "RIGHT" }[] {
  return sortDrafts(drafts)
    .filter((draft) => draft.body.trim().length > 0)
    .map((draft) => ({
      path: draft.filePath,
      line: draft.line,
      body: draft.body.trim(),
      ...(draft.side ? { side: draft.side } : {}),
      ...(draft.startLine === undefined ? {} : { start_line: draft.startLine, start_side: draft.startSide ?? draft.side ?? "RIGHT" }),
    }));
}

type ReviewDraftState = {
  drafts: Record<string, ReviewDraftComment[]>;
  addDraft: (key: string, input: ReviewDraftInput) => void;
  updateDraft: (key: string, id: string, body: string) => void;
  removeDraft: (key: string, id: string) => void;
  clearDrafts: (key: string) => void;
};

const EMPTY_DRAFTS: ReviewDraftComment[] = [];

let draftCounter = 0;

function nextDraftId(): string {
  draftCounter += 1;
  return `draft-${Date.now().toString(36)}-${draftCounter}`;
}

export const useReviewDraftStore = create<ReviewDraftState>()(
  persist(
    (set) => ({
      drafts: {},
      addDraft: (key, input) =>
        set((state) => {
          const existing = state.drafts[key] ?? EMPTY_DRAFTS;
          const draft: ReviewDraftComment = {
            id: nextDraftId(),
            filePath: input.filePath,
            line: input.line,
            body: input.body,
            createdAt: new Date().toISOString(),
            ...(input.side ? { side: input.side } : {}),
            ...(input.startLine === undefined ? {} : { startLine: input.startLine, startSide: input.startSide ?? input.side ?? "RIGHT" }),
            ...(input.commitId ? { commitId: input.commitId } : {}),
          };
          return { drafts: { ...state.drafts, [key]: [...existing, draft] } };
        }),
      updateDraft: (key, id, body) =>
        set((state) => {
          const existing = state.drafts[key];
          if (!existing) return state;
          return {
            drafts: {
              ...state.drafts,
              [key]: existing.map((draft) =>
                draft.id === id ? { ...draft, body } : draft,
              ),
            },
          };
        }),
      removeDraft: (key, id) =>
        set((state) => {
          const existing = state.drafts[key];
          if (!existing) return state;
          const next = existing.filter((draft) => draft.id !== id);
          const drafts = { ...state.drafts };
          if (next.length === 0) delete drafts[key];
          else drafts[key] = next;
          return { drafts };
        }),
      clearDrafts: (key) =>
        set((state) => {
          if (!state.drafts[key]) return state;
          const drafts = { ...state.drafts };
          delete drafts[key];
          return { drafts };
        }),
    }),
    {
      name: "l8git-pr-review-drafts",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function useReviewDrafts(
  path: string,
  number: number,
): ReviewDraftComment[] {
  return useReviewDraftStore((s) => s.drafts[draftKey(path, number)] ?? EMPTY_DRAFTS);
}
