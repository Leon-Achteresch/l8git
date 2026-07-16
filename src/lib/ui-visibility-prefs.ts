import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type UiVisibilityPrefs = {
  showAgentDock: boolean;
  showHeaderIsland: boolean;
  setShowAgentDock: (value: boolean) => void;
  setShowHeaderIsland: (value: boolean) => void;
};

export const useUiVisibilityPrefs = create<UiVisibilityPrefs>()(
  persist(
    (set) => ({
      showAgentDock: true,
      showHeaderIsland: true,
      setShowAgentDock: (showAgentDock) => set({ showAgentDock }),
      setShowHeaderIsland: (showHeaderIsland) => set({ showHeaderIsland }),
    }),
    {
      name: "l8git-ui-visibility-prefs",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
