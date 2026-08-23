import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type OnboardingPrefs = {
  welcomeDismissed: boolean;
  dismissWelcome: () => void;
  tourDone: boolean;
  tourActive: boolean;
  tourRunId: number;
  startTour: () => void;
  finishTour: () => void;
};

export const useOnboardingPrefs = create<OnboardingPrefs>()(
  persist(
    (set) => ({
      welcomeDismissed: false,
      dismissWelcome: () => set({ welcomeDismissed: true }),
      tourDone: false,
      tourActive: false,
      tourRunId: 0,
      startTour: () =>
        set((s) => ({
          tourActive: true,
          welcomeDismissed: true,
          tourRunId: s.tourRunId + 1,
        })),
      finishTour: () => set({ tourActive: false, tourDone: true }),
    }),
    {
      name: "l8git-onboarding-prefs",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        welcomeDismissed: s.welcomeDismissed,
        tourDone: s.tourDone,
      }),
    },
  ),
);

export function startOnboardingTour(): void {
  useOnboardingPrefs.getState().startTour();
}
