import { create } from "zustand";

import { dispatchIslandAction } from "@/lib/island/client";
import type { IslandRequest, IslandResult } from "@/lib/island/types";

export type IslandFlashEntry = {
  id: string;
  type: "success" | "error";
  title: string;
  description?: string;
};

const FLASH_MS = 3200;

type FlashState = {
  current: IslandFlashEntry | null;
  show: (entry: Omit<IslandFlashEntry, "id">) => void;
  dismiss: (id?: string) => void;
};

/**
 * The island's own result line. The detached window has no toaster of its own,
 * and inside the app this keeps action feedback on the island instead of in the
 * corner of a window that may be minimized.
 */
export const useIslandFlash = create<FlashState>()((set, get) => ({
  current: null,
  show: (entry) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    set({ current: { ...entry, id } });
    window.setTimeout(() => get().dismiss(id), FLASH_MS);
  },
  dismiss: (id) =>
    set((s) => (!id || s.current?.id === id ? { current: null } : s)),
}));

/** Runs an island action and reports the outcome on the island itself. */
export async function runIslandActionWithFlash(
  request: IslandRequest,
  label: string,
): Promise<IslandResult> {
  const result = await dispatchIslandAction(request);
  useIslandFlash.getState().show({
    type: result.ok ? "success" : "error",
    title: label,
    description: result.message,
  });
  return result;
}
