import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type UiVisibilityPrefs = {
  showAgentDock: boolean;
  setShowAgentDock: (value: boolean) => void;
};

export const useUiVisibilityPrefs = create<UiVisibilityPrefs>()(
  persist(
    (set) => ({
      showAgentDock: true,
      setShowAgentDock: (showAgentDock) => set({ showAgentDock }),
    }),
    {
      name: "l8git-ui-visibility-prefs",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
