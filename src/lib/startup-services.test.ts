import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkForAppUpdate = vi.fn();
const armNotifications = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@/lib/app-updater", () => ({ checkForAppUpdate }));
vi.mock("@/lib/notifications-wiring", () => ({ armNotifications }));

describe("startup services", () => {
  let frames: Map<number, FrameRequestCallback>;
  let idle: (() => void) | undefined;
  let nextFrame: number;
  const paint = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(0));
  };
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    frames = new Map();
    idle = undefined;
    nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.stubGlobal("requestIdleCallback", (callback: () => void) => { idle = callback; return 1; });
    vi.stubGlobal("cancelIdleCallback", () => { idle = undefined; });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("crosses a paint before arming services and starts only once across route remounts", async () => {
    const { scheduleStartupServices } = await import("./startup-services");
    scheduleStartupServices();
    scheduleStartupServices();
    expect(frames.size).toBe(1);
    expect(idle).toBeUndefined();
    paint();
    expect(idle).toBeUndefined();
    paint();
    expect(checkForAppUpdate).not.toHaveBeenCalled();
    idle?.();
    await vi.waitFor(() => expect(armNotifications).toHaveBeenCalledOnce());
    expect(checkForAppUpdate).toHaveBeenCalledOnce();
    scheduleStartupServices();
    paint();
    paint();
    idle?.();
    expect(armNotifications).toHaveBeenCalledOnce();
  });

  it("cancels a StrictMode probe without preventing the real mount", async () => {
    const { scheduleStartupServices } = await import("./startup-services");
    const cancel = scheduleStartupServices();
    paint();
    cancel();
    paint();
    expect(idle).toBeUndefined();
    const cancelIdle = scheduleStartupServices();
    paint();
    paint();
    const stale = idle;
    cancelIdle();
    stale?.();
    expect(checkForAppUpdate).not.toHaveBeenCalled();
    scheduleStartupServices();
    paint();
    paint();
    idle?.();
    await vi.waitFor(() => expect(checkForAppUpdate).toHaveBeenCalledOnce());
  });

  it("handles each failed service independently without an unhandled rejection", async () => {
    const updateFailure = new Error("Update startup failed");
    const notificationFailure = new Error("Notification startup failed");
    checkForAppUpdate.mockRejectedValueOnce(updateFailure);
    armNotifications.mockImplementationOnce(() => { throw notificationFailure; });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { scheduleStartupServices } = await import("./startup-services");
    scheduleStartupServices();
    paint();
    paint();
    idle?.();
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(2));
    expect(error).toHaveBeenCalledWith("[l8git] Update service startup failed", updateFailure);
    expect(error).toHaveBeenCalledWith("[l8git] Notification service startup failed", notificationFailure);
  });
});
