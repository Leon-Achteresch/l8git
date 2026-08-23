type SuspendListener = () => void;

const listeners = new Set<SuspendListener>();

export function onAppSuspend(listener: SuspendListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAppSuspend(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      continue;
    }
  }
}
