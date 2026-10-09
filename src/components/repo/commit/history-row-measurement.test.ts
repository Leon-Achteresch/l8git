import { describe, expect, it } from "vitest";
import {
  createHistoryRowObserver,
  estimateHistoryHeaderHeight,
  estimateHistoryRowHeight,
} from "./history-row-measurement";

function row(): HTMLElement {
  return {
    isConnected: true,
    get offsetHeight() {
      throw new Error("Synchronous layout read");
    },
    get clientHeight() {
      throw new Error("Synchronous layout read");
    },
    getBoundingClientRect() {
      throw new Error("Synchronous layout read");
    },
  } as unknown as HTMLElement;
}

function harness() {
  const callbacks: ((entries: readonly ResizeObserverEntry[]) => void)[] = [];
  const watched = new Set<Element>();
  const frames = new Map<number, () => void>();
  const measured: {
    index: number;
    height: number;
    key: string | number | bigint;
  }[] = [];
  let frameId = 0;
  const observer = createHistoryRowObserver(
    (index, height, key) => measured.push({ index, height, key }),
    {
      createObserver: (callback) => {
        callbacks.push(callback);
        return {
          observe: (element) => {
            watched.add(element);
          },
          unobserve: (element) => {
            watched.delete(element);
          },
          disconnect: () => {
            watched.clear();
          },
        };
      },
      requestFrame: (callback) => {
        frames.set(++frameId, callback);
        return frameId;
      },
      cancelFrame: (id) => {
        frames.delete(id);
      },
    },
  );
  const deliver = (
    target: HTMLElement,
    height: number,
    contentOnly = false,
    callback = callbacks[callbacks.length - 1]!,
  ) => {
    callback([
      {
        target,
        contentRect: { height },
        ...(contentOnly ? {} : { borderBoxSize: [{ blockSize: height }] }),
      } as unknown as ResizeObserverEntry,
    ]);
  };
  const flush = () => {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((callback) => callback());
  };
  return { observer, watched, callbacks, frames, measured, deliver, flush };
}

describe("pooled history row observations", () => {
  it("observes natural wrapped heights without synchronous layout reads", () => {
    const h = harness();
    const element = row();
    expect(() => h.observer.bind(element, 10, "commit-a")).not.toThrow();
    expect(h.measured).toEqual([]);
    h.deliver(element, 74.6);
    h.flush();
    expect(h.measured).toEqual([{ index: 10, height: 75, key: "commit-a" }]);
  });

  it("rebinds the same physical slot and measures equal-height logical rows separately", () => {
    const h = harness();
    const element = row();
    h.observer.bind(element, 10, "commit-a");
    h.deliver(element, 52);
    h.flush();
    h.observer.unbind(element);
    h.observer.bind(element, 500, "commit-b");
    h.deliver(element, 52);
    h.flush();
    expect(h.watched.size).toBe(1);
    expect(h.measured.map((item) => [item.index, item.key])).toEqual([
      [10, "commit-a"],
      [500, "commit-b"],
    ]);
  });

  it("rejects a delivered old height when its slot is reused before the frame", () => {
    const h = harness();
    const element = row();
    h.observer.bind(element, 10, "commit-a");
    h.deliver(element, 52);
    h.observer.unbind(element);
    h.observer.bind(element, 500, "commit-b");
    h.flush();
    expect(h.measured).toEqual([]);
    h.deliver(element, 30);
    h.flush();
    expect(h.measured).toEqual([{ index: 500, height: 30, key: "commit-b" }]);
  });

  it("supports content-box fallback and same-owner resize notifications", () => {
    const h = harness();
    const element = row();
    h.observer.bind(element, 12, "commit-c");
    h.deliver(element, 59.2, true);
    h.flush();
    h.deliver(element, 44, true);
    h.flush();
    expect(h.measured.map((item) => item.height)).toEqual([59, 44]);
  });

  it("batches repeated observations and discards removed physical rows", () => {
    const h = harness();
    const element = row();
    h.observer.bind(element, 12, "commit-c");
    h.deliver(element, 60);
    h.deliver(element, 44);
    expect(h.frames.size).toBe(1);
    h.flush();
    expect(h.measured.map((item) => item.height)).toEqual([44]);
    h.deliver(element, 80);
    h.observer.unbind(element);
    h.flush();
    expect(h.watched.size).toBe(0);
    expect(h.measured.map((item) => item.height)).toEqual([44]);
  });

  it("cancels stale callbacks and resumes existing bindings after StrictMode effect cleanup", () => {
    const h = harness();
    const element = row();
    h.observer.bind(element, 12, "commit-c");
    h.deliver(element, 60);
    const oldCallback = h.callbacks[0];
    h.observer.disconnect();
    h.flush();
    expect(h.measured).toEqual([]);
    expect(h.watched.size).toBe(0);
    h.observer.start();
    expect(h.watched.size).toBe(1);
    h.deliver(element, 99, false, oldCallback);
    h.flush();
    expect(h.measured).toEqual([]);
    h.deliver(element, 44);
    h.flush();
    expect(h.measured).toEqual([{ index: 12, height: 44, key: "commit-c" }]);
  });

  it("keeps observation registrations bounded across thousands of logical rebinds", () => {
    const h = harness();
    const element = row();
    for (let index = 0; index < 10_000; index++) {
      h.observer.unbind(element);
      h.observer.bind(element, index, `commit-${index}`);
    }
    expect(h.watched.size).toBe(1);
    expect(h.callbacks.length).toBe(1);
    h.deliver(element, 30);
    h.flush();
    expect(h.measured).toEqual([
      { index: 9999, height: 30, key: "commit-9999" },
    ]);
  });

  it("scales rem geometry while keeping the fixed margins at 150 percent", () => {
    expect(estimateHistoryRowHeight(1)).toBe(30);
    expect(estimateHistoryRowHeight(1.5)).toBe(44);
    expect(estimateHistoryRowHeight(0.7)).toBeCloseTo(21.6);
    expect(estimateHistoryRowHeight(1.5, true)).toBe(71.75);
    expect(estimateHistoryHeaderHeight(1.5)).toBe(37.5);
  });
});
