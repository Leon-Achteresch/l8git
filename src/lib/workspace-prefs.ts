import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type WorkspacePrefs = {
  ideLaunchCommand: string;
  setIdeLaunchCommand: (value: string) => void;
};

export const useWorkspacePrefs = create<WorkspacePrefs>()(
  persist(
    (set) => ({
      ideLaunchCommand: "",
      setIdeLaunchCommand: (ideLaunchCommand) => set({ ideLaunchCommand }),
    }),
    {
      name: "l8git-workspace-prefs",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
