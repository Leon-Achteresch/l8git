export interface KnownRepoPathsSource {
  subscribe: (listener: () => void) => () => void;
  get: () => readonly string[];
}

const EMPTY: readonly string[] = [];

const inertSource: KnownRepoPathsSource = {
  subscribe: () => () => {},
  get: () => EMPTY,
};

let source: KnownRepoPathsSource = inertSource;

export function setKnownRepoPathsSource(next: KnownRepoPathsSource): void {
  source = next;
}

export function subscribeKnownRepoPaths(listener: () => void): () => void {
  return source.subscribe(listener);
}

export function knownRepoPaths(): readonly string[] {
  return source.get();
}
