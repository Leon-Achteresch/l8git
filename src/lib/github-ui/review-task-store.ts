import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { platformStorage } from "@/lib/platform/kv";

/** Local-only "done" marks for review threads (subject key → thread id → timestamp). Never synced. */
export const useReviewTaskStore = create<{
  done: Record<string, Record<string, number>>;
  toggle: (subject: string, thread: string, now?: number) => void;
}>()(
  persist(
    (set) => ({
      done: {},
      toggle: (subject, thread, now = Date.now()) =>
        set((s) => {
          const cur = { ...s.done[subject] };
          if (cur[thread]) delete cur[thread];
          else cur[thread] = now;
          return { done: { ...s.done, [subject]: cur } };
        }),
    }),
    { name: "l8git-review-tasks-v1", storage: createJSONStorage(() => platformStorage) },
  ),
);
