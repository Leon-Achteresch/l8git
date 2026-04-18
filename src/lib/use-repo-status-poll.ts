import { useRepoStore } from "@/lib/repo-store";
import { useEffect, useRef } from "react";

const STATUS_POLL_MS_VISIBLE = 5000;
const STATUS_POLL_MS_HIDDEN = 20000;

export function useRepoStatusPoll() {
  const activePath = useRepoStore((s) => s.activePath);
  const reloadLocalStatus = useRepoStore((s) => s.reloadLocalStatus);
  const reloadStashes = useRepoStore((s) => s.reloadStashes);

  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!activePath) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pollIntervalMs = () =>
      document.visibilityState === "visible"
        ? STATUS_POLL_MS_VISIBLE
        : STATUS_POLL_MS_HIDDEN;

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
    };
  }, [activePath, reloadLocalStatus, reloadStashes]);
}
