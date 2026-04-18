import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type AnimationPrefs = {
  animationsEnabled: boolean;
  setAnimationsEnabled: (value: boolean) => void;
};

export const useAnimationPrefs = create<AnimationPrefs>()(
  persist(
    (set) => ({
      animationsEnabled: true,
      setAnimationsEnabled: (animationsEnabled) => set({ animationsEnabled }),
    }),
    {
      name: "gitit-animation-prefs",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
