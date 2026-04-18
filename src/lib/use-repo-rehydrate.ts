import { useEffect, useRef } from "react";
import { useRepoStore } from "@/lib/repo-store";

export function useRepoRehydrate() {
  const reloadAll = useRepoStore((s) => s.reloadAll);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void reloadAll();
  }, [reloadAll]);
}
