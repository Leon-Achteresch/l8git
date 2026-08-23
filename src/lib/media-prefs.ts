import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ImageDiffMode = "sideBySide" | "swipe" | "onion";

export type ImageDiffZoom = "fit" | "actual";

type MediaPrefs = {
  imageDiffMode: ImageDiffMode;
  setImageDiffMode: (value: ImageDiffMode) => void;
  imageDiffZoom: ImageDiffZoom;
  setImageDiffZoom: (value: ImageDiffZoom) => void;
  toggleImageDiffZoom: () => void;
};

export const useMediaPrefs = create<MediaPrefs>()(
  persist(
    (set) => ({
      imageDiffMode: "sideBySide",
      setImageDiffMode: (imageDiffMode) => set({ imageDiffMode }),
      imageDiffZoom: "fit",
      setImageDiffZoom: (imageDiffZoom) => set({ imageDiffZoom }),
      toggleImageDiffZoom: () =>
        set((s) => ({ imageDiffZoom: s.imageDiffZoom === "fit" ? "actual" : "fit" })),
    }),
    {
      name: "l8git-media-prefs",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
