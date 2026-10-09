/** The row has rem-based text/padding and two fixed 1px vertical margins. */
export function estimateHistoryRowHeight(
  scale: number,
  searchMatch = false,
): number {
  return 28 * scale + 2 + (searchMatch ? 18.5 * scale : 0);
}

/** 10px text at 1.5 line-height, plus 10px padding, all scaled with the root. */
export function estimateHistoryHeaderHeight(scale: number): number {
  return 25 * scale;
}

type HistoryRowKey = string | number | bigint;
type RowOwner = { index: number; key: HistoryRowKey };
type ObserverEnvironment = {
  createObserver: (
    callback: (entries: readonly ResizeObserverEntry[]) => void,
  ) => Pick<ResizeObserver, "observe" | "unobserve" | "disconnect">;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
};

const browserObservation: ObserverEnvironment = {
  createObserver: (callback) =>
    new ResizeObserver((entries) => callback(entries)),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

/**
 * A bounded DOM pool reuses a node for different logical commits. Observe the
 * physical nodes once per binding and retain the logical owner with each
 * delivered measurement, so a delayed callback cannot resize a newer commit.
 * Only the public resizeItem API is needed; TanStack's element cache stays out
 * of this registration because its standard ref assumes logical DOM identity.
 */
export function createHistoryRowObserver(
  onMeasure: (index: number, height: number, key: HistoryRowKey) => void,
  environment: ObserverEnvironment = browserObservation,
) {
  const owners = new Map<HTMLElement, RowOwner>();
  const pending = new Map<HTMLElement, { owner: RowOwner; height: number }>();
  let observer: ReturnType<ObserverEnvironment["createObserver"]> | null = null;
  let observationEpoch = 0;
  let frame: number | null = null;

  const flush = () => {
    frame = null;
    const batch = [...pending];
    pending.clear();
    for (const [element, { owner, height }] of batch) {
      if (element.isConnected && owners.get(element) === owner) {
        onMeasure(owner.index, height, owner.key);
      }
    }
  };
  const getObserver = () => {
    if (observer) return observer;
    const epoch = ++observationEpoch;
    observer = environment.createObserver((entries) => {
      if (epoch !== observationEpoch) return;
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const owner = owners.get(element);
        if (!owner || !element.isConnected) continue;
        const height = Math.round(
          entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
        );
        pending.set(element, { owner, height });
      }
      if (pending.size > 0 && frame === null)
        frame = environment.requestFrame(flush);
    });
    return observer;
  };
  return {
    start() {
      if (observer) return;
      for (const element of owners.keys()) {
        if (element.isConnected) getObserver().observe(element);
      }
    },
    bind(element: HTMLElement, index: number, key: HistoryRowKey) {
      const previous = owners.get(element);
      if (previous?.index === index && previous.key === key) return;
      // Re-observe even when heights match. The new logical item still needs
      // its own natural measurement rather than the previous item's estimate.
      if (previous) observer?.unobserve(element);
      pending.delete(element);
      owners.set(element, { index, key });
      getObserver().observe(element);
    },
    unbind(element: HTMLElement) {
      owners.delete(element);
      pending.delete(element);
      observer?.unobserve(element);
    },
    disconnect() {
      if (frame !== null) environment.cancelFrame(frame);
      frame = null;
      observer?.disconnect();
      observer = null;
      observationEpoch++;
      // Retain live bindings for React StrictMode's effect cleanup/setup cycle.
      // Actual unmount refs remove their own bindings with unbind().
      pending.clear();
    },
  };
}

export type HistoryRowObserver = ReturnType<typeof createHistoryRowObserver>;
