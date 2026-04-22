import { useRepoStore } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

// Fallback poll interval once the file-system watcher is attached. A watcher
// is authoritative for real changes; this interval is only a safety net for
// missed events on exotic filesystems (network mounts, FUSE layers).
const FALLBACK_POLL_MS_VISIBLE = 60_000;
const FALLBACK_POLL_MS_HIDDEN = 180_000;

export function useRepoStatusPoll() {
  const activePath = useRepoStore((s) => s.activePath);
  const reloadLocalStatus = useRepoStore((s) => s.reloadLocalStatus);
  const reloadStashes = useRepoStore((s) => s.reloadStashes);

  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!activePath) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unlistenFn: (() => void) | null = null;

    const pollIntervalMs = () =>
      document.visibilityState === "visible"
        ? FALLBACK_POLL_MS_VISIBLE
        : FALLBACK_POLL_MS_HIDDEN;

    const tick = async () => {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await Promise.all([
          reloadLocalStatus(activePath),
          reloadStashes(activePath),
        ]);
      } finally {
        inFlightRef.current = false;
      }
    };

    const scheduleAfter = (ms: number) => {
      if (cancelled) return;
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(loop, ms);
    };

    const loop = async () => {
      if (cancelled) return;
      await tick();
      if (cancelled) return;
      scheduleAfter(pollIntervalMs());
    };

    void tick();
    scheduleAfter(pollIntervalMs());

    // Attach the native file-system watcher; on change events we reload
    // status immediately instead of waiting for the next fallback tick.
    invoke("watch_repo", { path: activePath }).catch(() => {
      // Silently fall back to polling if the watcher cannot attach
      // (e.g. unsupported filesystem).
    });

    void listen<string>("repo-changed", (event) => {
      if (cancelled) return;
      if (event.payload !== activePath) return;
      void tick();
    }).then((un) => {
      if (cancelled) {
        un();
      } else {
        unlistenFn = un;
      }
    });

    const onVisibility = () => {
      if (cancelled) return;
      if (timer != null) clearTimeout(timer);
      if (document.visibilityState === "visible") {
        void tick();
      }
      scheduleAfter(pollIntervalMs());
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      if (unlistenFn) unlistenFn();
      invoke("unwatch_repo", { path: activePath }).catch(() => {
        // ignore: window is closing or watcher already gone
      });
    };
  }, [activePath, reloadLocalStatus, reloadStashes]);
}
