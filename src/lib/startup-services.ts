import { isTauri } from "@tauri-apps/api/core";

let started = false;
let scheduled = false;

/** Called after the initial route commits. Idle time before that belongs to startup. */
export function scheduleStartupServices(): () => void {
  if (!isTauri() || started || scheduled) return () => {};
  scheduled = true;
  let frame = 0;
  let idle: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const run = () => {
    if (disposed || started) return;
    started = true;
    scheduled = false;
    void import("@/lib/app-updater").then(m => m.checkForAppUpdate())
      .catch(error => console.error("[l8git] Update service startup failed", error));
    void import("@/lib/notifications-wiring").then(m => m.armNotifications())
      .catch(error => console.error("[l8git] Notification service startup failed", error));
  };
  // Cross a paint before loading the agent stores behind notification wiring.
  // Do not postpone them by a fixed multi-second delay on fast machines.
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      if (typeof requestIdleCallback === "function") idle = requestIdleCallback(run, { timeout: 5000 });
      else timer = setTimeout(run, 0);
    });
  });
  return () => {
    disposed = true;
    scheduled = false;
    cancelAnimationFrame(frame);
    if (idle !== undefined) cancelIdleCallback(idle);
    if (timer !== undefined) clearTimeout(timer);
  };
}
