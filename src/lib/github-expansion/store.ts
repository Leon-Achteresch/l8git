import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { HubAccount } from "@/lib/hub/types";

export type PrDraft = { title: string; body: string; base: string; head: string; draft: boolean };
export type SearchPreset = { id: string; name: string; query: string };
export type CommentTemplate = { id: string; name: string; body: string };
export type ReviewSnapshot = { head: string; files: Record<string, string>; reviewedAt: number };
export type ReviewPosition = { file: string; line?: number; scrollTop?: number };
export type Snooze = { until: number } | { untilChangedFrom: string };
export type SubjectState = {
  note?: string; priority?: number; pinned?: boolean; snooze?: Snooze;
  waiting?: "me" | "others"; position?: ReviewPosition; lastVisitedAt?: number;
  workspace?: { repoPath: string; worktreePath: string; branch: string; head: string; context: string; linkedAt: number };
};
export type QuietHours = { enabled: boolean; startMinute: number; endMinute: number };
export type CheckReminder = { subject: string; headSha: string; checkName: string; when: "completed" | "success" | "failure"; deliveredAt: number | null };
export type BranchContext = { panel: string; file?: string; scrollTop?: number; taskKey?: string };
type GithubWorkspace = {
  drafts: Record<string, PrDraft>; subjects: Record<string, SubjectState>;
  reviews: Record<string, ReviewSnapshot>; searches: Record<string, SearchPreset[]>;
  templates: CommentTemplate[]; reviewQueue: string[]; quietHours: QuietHours;
  reminders: Record<string, CheckReminder>; branchContexts: Record<string, BranchContext>;
  saveDraft: (key: string, draft: PrDraft | null) => void;
  updateSubject: (key: string, patch: Partial<SubjectState>) => void;
  markReviewed: (key: string, head: string, path: string, fingerprint: string, now?: number) => void;
  unmarkReviewed: (key: string, path: string) => void;
  clearReview: (key: string) => void;
  saveSearches: (scope: string, searches: SearchPreset[]) => void;
  saveTemplates: (templates: CommentTemplate[]) => void;
  setReviewQueue: (keys: string[]) => void;
  setQuietHours: (quietHours: QuietHours) => void;
  saveReminder: (id: string, reminder: CheckReminder | null) => void;
  claimReminder: (id: string, now?: number) => boolean;
  saveBranchContext: (repoPath: string, branch: string, context: BranchContext) => void;
};

/** JSON tuples avoid collisions from user-controlled separators in repository/account names. */
export function accountScope(a: HubAccount, repo: string): string {
  return JSON.stringify([a.provider, a.host.toLowerCase(), a.login.toLowerCase(), repo.toLowerCase()]);
}
export function subjectKey(a: HubAccount, repo: string, kind: "issue" | "pull", number: number): string {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("Invalid subject number.");
  return JSON.stringify([accountScope(a, repo), kind, number]);
}
export function branchContextKey(repoPath: string, branch: string): string { return JSON.stringify([repoPath, branch]); }

export const useGithubWorkspace = create<GithubWorkspace>()(persist((set) => ({
  drafts: {}, subjects: {}, reviews: {}, searches: {}, templates: [], reviewQueue: [], reminders: {}, branchContexts: {},
  quietHours: { enabled: false, startMinute: 22 * 60, endMinute: 8 * 60 },
  saveDraft: (key, draft) => set(state => {
    const drafts = { ...state.drafts };
    if (draft) drafts[key] = { ...draft }; else delete drafts[key];
    return { drafts };
  }),
  updateSubject: (key, patch) => set(state => ({ subjects: { ...state.subjects, [key]: { ...state.subjects[key], ...patch } } })),
  markReviewed: (key, head, path, fingerprint, now = Date.now()) => set(state => ({
    reviews: { ...state.reviews, [key]: { head, reviewedAt: now, files: { ...state.reviews[key]?.files, [path]: fingerprint } } },
  })),
  unmarkReviewed: (key, path) => set(state => {
    const review = state.reviews[key];
    if (!review) return {};
    const files = { ...review.files }; delete files[path];
    return { reviews: { ...state.reviews, [key]: { ...review, files } } };
  }),
  clearReview: key => set(state => { const reviews = { ...state.reviews }; delete reviews[key]; return { reviews }; }),
  saveSearches: (scope, searches) => set(state => ({ searches: { ...state.searches, [scope]: searches.map(item => ({ ...item })) } })),
  saveTemplates: templates => set({ templates: templates.map(item => ({ ...item })) }),
  setReviewQueue: keys => set({ reviewQueue: [...new Set(keys)] }),
  setQuietHours: quietHours => {
    for (const minute of [quietHours.startMinute, quietHours.endMinute]) {
      if (!Number.isInteger(minute) || minute < 0 || minute >= 1440) throw new Error("Invalid quiet-hour time.");
    }
    set({ quietHours: { ...quietHours } });
  },
  saveReminder: (id, reminder) => set(state => {
    const reminders = { ...state.reminders };
    if (reminder) reminders[id] = { ...reminder }; else delete reminders[id];
    return { reminders };
  }),
  claimReminder: (id, now = Date.now()) => {
    let claimed = false;
    set(state => {
      const reminder = state.reminders[id];
      if (!reminder || reminder.deliveredAt !== null) return {};
      claimed = true;
      return { reminders: { ...state.reminders, [id]: { ...reminder, deliveredAt: now } } };
    });
    return claimed;
  },
  saveBranchContext: (repoPath, branch, context) => set(state => ({ branchContexts: { ...state.branchContexts, [branchContextKey(repoPath, branch)]: { ...context } } })),
}), { name: "l8git-github-workspace-v1", storage: createJSONStorage(() => localStorage) }));

/** Callers must provide all current files and their pinned content fingerprint, not a truncated patch. */
export function reviewProgress(snapshot: ReviewSnapshot | undefined, files: { path: string; fingerprint: string }[]) {
  const reviewed: string[] = [], changed: string[] = [], unseen: string[] = [];
  for (const file of files) {
    const previous = snapshot?.files[file.path];
    if (previous === undefined) unseen.push(file.path);
    else if (previous === file.fingerprint) reviewed.push(file.path);
    else changed.push(file.path);
  }
  const paths = new Set(files.map(file => file.path));
  const removed = Object.keys(snapshot?.files ?? {}).filter(path => !paths.has(path));
  return { reviewed, changed, unseen, removed };
}

export function isSnoozed(snooze: Snooze | undefined, currentState: string, now = Date.now()): boolean {
  if (!snooze) return false;
  return "until" in snooze ? snooze.until > now : snooze.untilChangedFrom === currentState;
}

/** Equal start/end means a full quiet day; dates use the user's local timezone, including DST. */
export function isQuietHour(quiet: QuietHours, now = new Date()): boolean {
  if (!quiet.enabled) return false;
  const minute = now.getHours() * 60 + now.getMinutes();
  if (quiet.startMinute === quiet.endMinute) return true;
  return quiet.startMinute < quiet.endMinute
    ? minute >= quiet.startMinute && minute < quiet.endMinute
    : minute >= quiet.startMinute || minute < quiet.endMinute;
}
