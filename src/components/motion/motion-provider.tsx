import { LazyMotion, MotionConfig } from "motion/react";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { useAnimationPrefs } from "@/lib/animation-prefs";

const loadMotionFeatures = () =>
  import("./motion-features").then((m) => m.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  const enabled = useAnimationPrefs((s) => s.animationsEnabled);

  useEffect(() => {
    const root = document.documentElement;
    if (enabled) root.removeAttribute("data-animations");
    else root.setAttribute("data-animations", "off");
  }, [enabled]);

  return (
    <LazyMotion features={loadMotionFeatures}>
      <MotionConfig
        reducedMotion={enabled ? "user" : "always"}
        transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.6 }}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
