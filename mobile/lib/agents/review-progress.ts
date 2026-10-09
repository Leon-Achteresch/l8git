import type { QueryCache } from '@tanstack/react-query';
import { createStore } from 'zustand/vanilla';

export interface ReviewProgressContext {
  readonly hostId: string;
  readonly worktreePath: string;
  readonly mergeBase: string;
}

export interface DisplayedReviewFile extends ReviewProgressContext {
  readonly file: string;
  readonly fingerprint: string;
  readonly epoch: number;
}

export interface ReviewProgressAvailability extends ReviewProgressContext {
  file: string;
  fingerprint: string | null | undefined;
  online: boolean;
  busy: boolean;
  focused: boolean;
  loading: boolean;
  fetching: boolean;
  error: unknown;
}

export const EMPTY_REVIEW_MARKS: Readonly<Record<string, string>> = Object.freeze({});

export function reviewProgressContextKey(context: ReviewProgressContext): string {
  return JSON.stringify([context.hostId, context.worktreePath, context.mergeBase]);
}

interface ReviewProgressState {
  context: Readonly<ReviewProgressContext> | null;
  summaryRevision: number | null;
  epoch: number;
  marks: Readonly<Record<string, string>>;
  fingerprints: Readonly<Record<string, string>>;
  begin: (context: ReviewProgressContext, summaryRevision?: number) => void;
  observeSummary: (context: ReviewProgressContext, revision: number) => void;
  observeFile: (context: ReviewProgressContext, file: string, fingerprint: string) => void;
  display: (context: ReviewProgressContext, file: string, fingerprint: string) => DisplayedReviewFile | null;
  invalidate: (context: ReviewProgressContext) => void;
  canMark: (displayed: DisplayedReviewFile | null, current: ReviewProgressAvailability) => boolean;
  mark: (displayed: DisplayedReviewFile | null, current: ReviewProgressAvailability) => boolean;
}

function sameContext(a: ReviewProgressContext | null, b: ReviewProgressContext): boolean {
  return a !== null && reviewProgressContextKey(a) === reviewProgressContextKey(b);
}

function canMark(state: ReviewProgressState, displayed: DisplayedReviewFile | null, current: ReviewProgressAvailability): boolean {
  return Boolean(displayed && sameContext(state.context, displayed) && sameContext(displayed, current) &&
    displayed.file === current.file && displayed.fingerprint.length > 0 && displayed.fingerprint === current.fingerprint &&
    displayed.epoch === state.epoch && state.fingerprints[displayed.file] === displayed.fingerprint &&
    current.online && !current.busy && current.focused && !current.loading && !current.fetching && !current.error);
}

/** Review progress lasts only for the current opened review, never in storage. */
export function createReviewProgressStore() {
  return createStore<ReviewProgressState>((set, get) => ({
    context: null, summaryRevision: null, epoch: 0, marks: EMPTY_REVIEW_MARKS, fingerprints: EMPTY_REVIEW_MARKS,
    begin: (context, summaryRevision) => {
      const state = get();
      if (!context.hostId || !context.worktreePath || !context.mergeBase) return;
      if (sameContext(state.context, context)) {
        if (summaryRevision !== undefined) state.observeSummary(context, summaryRevision);
        return;
      }
      set({ context: Object.freeze({ ...context }), summaryRevision: summaryRevision ?? null,
        epoch: state.epoch + 1, marks: EMPTY_REVIEW_MARKS, fingerprints: EMPTY_REVIEW_MARKS });
    },
    observeSummary: (context, revision) => {
      const state = get();
      if (!sameContext(state.context, context) || state.summaryRevision === revision) return;
      set({ summaryRevision: revision, epoch: state.epoch + 1,
        marks: EMPTY_REVIEW_MARKS, fingerprints: EMPTY_REVIEW_MARKS });
    },
    observeFile: (context, file, fingerprint) => {
      const state = get();
      if (!sameContext(state.context, context) || !file || !fingerprint || state.fingerprints[file] === fingerprint) return;
      const marks = { ...state.marks };
      if (marks[file] !== fingerprint) delete marks[file];
      set({ fingerprints: { ...state.fingerprints, [file]: fingerprint }, marks });
    },
    display: (context, file, fingerprint) => {
      if (!sameContext(get().context, context) || !file || !fingerprint) return null;
      get().observeFile(context, file, fingerprint);
      return Object.freeze({ ...context, file, fingerprint, epoch: get().epoch });
    },
    invalidate: (context) => {
      const state = get();
      if (!sameContext(state.context, context) ||
          Object.keys(state.fingerprints).length === 0 && Object.keys(state.marks).length === 0) return;
      set({ epoch: state.epoch + 1, marks: EMPTY_REVIEW_MARKS, fingerprints: EMPTY_REVIEW_MARKS });
    },
    canMark: (displayed, current) => canMark(get(), displayed, current),
    mark: (displayed, current) => {
      if (!displayed || !canMark(get(), displayed, current)) return false;
      set({ marks: { ...get().marks, [displayed.file]: displayed.fingerprint } });
      return true;
    },
  }));
}

export const reviewProgressStore = createReviewProgressStore();

/** A fresh summary expires old progress even when its line counts are unchanged. */
export function subscribeReviewProgressCache(
  cache: QueryCache,
  context: ReviewProgressContext,
  store = reviewProgressStore,
): () => void {
  return cache.subscribe((event) => {
    if (event.type !== 'updated') return;
    const [hostId, path, domain, kind, , file] = event.query.queryKey;
    if (hostId !== context.hostId || path !== context.worktreePath || domain !== 'agent-review') return;
    if (event.action.type === 'invalidate') {
      store.getState().invalidate(context);
    } else if (event.action.type === 'success' && kind === 'summary') {
      store.getState().observeSummary(context, event.query.state.dataUpdatedAt);
    } else if (event.action.type === 'success' && kind === 'file' &&
               event.query.queryKey[4] === context.mergeBase && typeof file === 'string') {
      const data = event.query.state.data;
      if (data && typeof data === 'object' && 'fingerprint' in data && typeof data.fingerprint === 'string') {
        store.getState().observeFile(context, file, data.fingerprint);
      }
    }
  });
}
