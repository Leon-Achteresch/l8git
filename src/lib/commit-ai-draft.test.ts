import { describe, expect, it, vi } from "vitest";
import { createCommitDraftStream, EmptyGeneratedCommitDraft, generateFreshCommitDraft, StagedCommitContextChanged } from "./commit-ai-draft";

function frameHarness() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  const request = vi.fn((callback: FrameRequestCallback) => { const id = ++nextId; callbacks.set(id, callback); return id; });
  const cancel = vi.fn((id: number) => { callbacks.delete(id); });
  const tick = () => {
    const pending = [...callbacks.values()]; callbacks.clear();
    for (const callback of pending) callback(0);
  };
  return { request, cancel, tick };
}

describe("transient commit message streaming", () => {
  it("renders only the latest text once per animation frame", () => {
    const scheduler = frameHarness();
    const render = vi.fn();
    const stream = createCommitDraftStream(render, scheduler);
    for (let i = 0; i < 250; i++) stream.push(`partial ${i}`);
    expect(scheduler.request).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    scheduler.tick();
    expect(render).toHaveBeenCalledExactlyOnceWith("partial 249");
    stream.push("next partial"); scheduler.tick();
    expect(render).toHaveBeenLastCalledWith("next partial");
  });

  it("cancels a queued frame and rejects updates from a closed generation", () => {
    const scheduler = frameHarness();
    const render = vi.fn();
    const stream = createCommitDraftStream(render, scheduler);
    stream.push("stale partial"); stream.cancel(); stream.push("late partial");
    scheduler.tick();
    expect(render).not.toHaveBeenCalled();
    expect(scheduler.cancel).toHaveBeenCalledTimes(1);
    expect(scheduler.request).toHaveBeenCalledTimes(1);
  });
});

describe("generated commit draft context", () => {
  it("checks the authoritative staged diff again before returning a final message", async () => {
    const readDiff = vi.fn().mockResolvedValue("captured staged diff");
    const generate = vi.fn().mockResolvedValue("feat: add feature");
    const signal = new AbortController().signal;
    expect(await generateFreshCommitDraft({ signal, readDiff, generate })).toBe("feat: add feature");
    expect(readDiff).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledExactlyOnceWith("captured staged diff", signal);
  });

  it("rejects a changed context including same-size edits instead of installing a stale result", async () => {
    const readDiff = vi.fn().mockResolvedValueOnce("old").mockResolvedValueOnce("new");
    await expect(generateFreshCommitDraft({ signal: new AbortController().signal, readDiff, generate: async () => "Stale title" })).rejects.toBeInstanceOf(StagedCommitContextChanged);
  });

  it("stops before generation when canceled during the initial Git read", async () => {
    const abort = new AbortController();
    const generate = vi.fn();
    const readDiff = vi.fn(async () => { abort.abort(); return "old"; });
    await expect(generateFreshCommitDraft({ signal: abort.signal, readDiff, generate })).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
    expect(readDiff).toHaveBeenCalledTimes(1);
  });

  it("does not collect a second context after a canceled or failed model call", async () => {
    const abort = new AbortController();
    const readDiff = vi.fn().mockResolvedValue("old");
    await expect(generateFreshCommitDraft({ signal: abort.signal, readDiff, generate: async () => { abort.abort(); return "canceled result"; } })).rejects.toThrow();
    expect(readDiff).toHaveBeenCalledTimes(1);
    await expect(generateFreshCommitDraft({ signal: new AbortController().signal, readDiff, generate: async () => { throw new Error("Provider unavailable"); } })).rejects.toThrow("Provider unavailable");
    expect(readDiff).toHaveBeenCalledTimes(2);
  });

  it("rejects a result when cancellation arrives during the final freshness read", async () => {
    const abort = new AbortController();
    let reads = 0;
    const readDiff = vi.fn(async () => { if (++reads === 2) abort.abort(); return "old"; });
    await expect(generateFreshCommitDraft({ signal: abort.signal, readDiff, generate: async () => "late result" })).rejects.toThrow();
    expect(readDiff).toHaveBeenCalledTimes(2);
  });

  it("refuses an empty model result so it cannot replace the manual draft", async () => {
    const readDiff = vi.fn().mockResolvedValue("captured changes");
    await expect(generateFreshCommitDraft({ signal: new AbortController().signal, readDiff, generate: async () => " \n\n" })).rejects.toBeInstanceOf(EmptyGeneratedCommitDraft);
    expect(readDiff).toHaveBeenCalledTimes(1);
  });
});
