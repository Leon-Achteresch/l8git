import { MorphIcon as Morph } from "morphicons/react";
import type { MorphIconProps } from "morphicons/react";

import { useAnimationPrefs } from "@/lib/animation-prefs";
import { cn } from "@/lib/utils";

export type { IconInput, MorphHandle } from "morphicons/react";

export function MorphIcon({
  className,
  spring = "snappy",
  ...props
}: MorphIconProps) {
  const enabled = useAnimationPrefs((s) => s.animationsEnabled);
  return (
    <Morph
      {...props}
      spring={spring}
      reducedMotion={enabled ? "user" : "always"}
      className={cn("shrink-0", className)}
    />
  );
}
