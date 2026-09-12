import { useRepoStore } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { createCoalescedRefresh } from "@/lib/coalesced-refresh";

// Fallback poll interval once the file-system watcher is attached. A watcher
// is authoritative for real changes; this interval is only a safety net for
// missed events on exotic filesystems (network mounts, FUSE layers).
const FALLBACK_POLL_MS_VISIBLE = 60_000;
const FALLBACK_POLL_MS_HIDDEN = 180_000;

export function useRepoStatusPoll() {
  const activePath = useRepoStore((s) => s.activePath);
  const reloadLocalStatus = useRepoStore((s) => s.reloadLocalStatus);
  const reloadStashes = useRepoStore((s) => s.reloadStashes);
  const reloadRebaseState = useRepoStore((s) => s.reloadRebaseState);
  const refreshOpenRepo = useRepoStore((s) => s.refreshOpenRepo);

  useEffect(() => {
    if (!activePath || !isTauri()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unlistenFns: (() => void)[] = [];
    let gitDirty = false;

    const pollIntervalMs = () =>
      document.visibilityState === "visible"
        ? FALLBACK_POLL_MS_VISIBLE
        : FALLBACK_POLL_MS_HIDDEN;

    const refresh = createCoalescedRefresh(async () => {
      await Promise.allSettled([
        reloadLocalStatus(activePath),
        reloadStashes(activePath),
        reloadRebaseState(activePath),
      ]);
    });
    const tick = refresh.request;

    const repoRefresh = createCoalescedRefresh(() => refreshOpenRepo(activePath));
    const tickRepo = repoRefresh.request;

    const track = (p: Promise<() => void>) => {
      void p.then((un) => {
        if (cancelled) un();
        else unlistenFns.push(un);
      });
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

    track(
      listen<string>("repo-changed", (event) => {
        if (cancelled) return;
        if (event.payload !== activePath) return;
        // While hidden, the fallback timer provides bounded refreshes. The
        // visibility handler catches up immediately when the user returns.
        if (document.visibilityState !== "visible") return;
        void tick();
      }),
    );

    track(
      listen<string>("repo-git-changed", (event) => {
        if (cancelled) return;
        if (event.payload !== activePath) return;
        if (document.visibilityState !== "visible") {
          gitDirty = true;
          return;
        }
        void tickRepo();
      }),
    );

    const onVisibility = () => {
      if (cancelled) return;
      if (timer != null) clearTimeout(timer);
      if (document.visibilityState === "visible") {
        void tick();
        if (gitDirty) {
          gitDirty = false;
          void tickRepo();
        }
      }
      scheduleAfter(pollIntervalMs());
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      refresh.dispose();
      repoRefresh.dispose();
      if (timer != null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const un of unlistenFns) un();
      invoke("unwatch_repo", { path: activePath }).catch(() => {
        // ignore: window is closing or watcher already gone
      });
    };
  }, [
    activePath,
    reloadLocalStatus,
    reloadStashes,
    reloadRebaseState,
    refreshOpenRepo,
  ]);
}
