type HistorySelection = {
  selectedHash: string | null;
  selectedHashes: ReadonlySet<string>;
  anchorHash: string | null;
  cursorHash: string | null;
};

type ScrollPosition = { context: string; offset: number };

type RepoViewState = {
  historySelection?: HistorySelection;
  selectedFile?: string | null;
  fileList?: {
    query: string;
    collapsed: ReadonlySet<"conflicts" | "staged" | "unstaged">;
    collapsedFolders: ReadonlySet<string>;
  };
  historyScroll?: ScrollPosition;
  filesScroll?: ScrollPosition;
};

// Store only view state, never mounted panels, diffs or file contents.
const views = new Map<string, RepoViewState>();
const MAX_REPOSITORIES = 24;
const EMPTY_VIEW: RepoViewState = {};

export function readRepoViewState(path: string): Readonly<RepoViewState> {
  return views.get(path) ?? EMPTY_VIEW;
}

export function saveRepoViewState(path: string, patch: Partial<RepoViewState>) {
  if (!path) return;
  const next = { ...views.get(path), ...patch };
  views.delete(path);
  views.set(path, next);
  if (views.size > MAX_REPOSITORIES) views.delete(views.keys().next().value!);
}

export function forgetRepoViewState(path: string) {
  views.delete(path);
}

export function hasRepoViewState(path: string) {
  return views.has(path);
}

export type RepoScrollView = "historyScroll" | "filesScroll";

export function readRepoScroll(path: string, view: RepoScrollView, context: string) {
  const saved = readRepoViewState(path)[view];
  return saved?.context === context ? saved.offset : 0;
}
