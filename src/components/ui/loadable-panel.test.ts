import { describe, expect, it, vi } from "vitest";
import { loadablePanel } from "./loadable-panel";

describe("panel loading", () => {
  it("shares in-flight imports and caches the successful component", async () => {
    const Component = () => null;
    let resolve!: (component: typeof Component) => void;
    const load = vi.fn(() => new Promise<typeof Component>(done => { resolve = done; }));
    const panel = loadablePanel(load, null);
    const first = panel.preload();
    expect(panel.preload()).toBe(first);
    resolve(Component);
    expect(await first).toBe(Component);
    expect(await panel.preload()).toBe(Component);
    expect(load).toHaveBeenCalledOnce();
  });

  it("propagates a failed import and permits the error boundary's next attempt", async () => {
    const Component = () => null;
    const failure = new Error("Chunk temporarily unavailable");
    const load = vi.fn<() => Promise<typeof Component>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(Component);
    const panel = loadablePanel(load, null);
    await expect(panel.preload()).rejects.toBe(failure);
    expect(await panel.preload()).toBe(Component);
    expect(await panel.preload()).toBe(Component);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
