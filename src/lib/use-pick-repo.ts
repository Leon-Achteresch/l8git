import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useRepoStore } from "@/lib/repo-store";

export function usePickRepo() {
  const addRepo = useRepoStore((s) => s.addRepo);
  return useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;
    await addRepo(selected);
  }, [addRepo]);
}
