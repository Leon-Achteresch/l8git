import type { ComponentType, ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { TEXT_SHIMMER_CLASS_NAME } from "@/lib/motion/text-shimmer";
import { motionize } from "@/components/motion/kit";

export interface TextShimmerProps {
  children: ReactNode;
  as?: ElementType;
  duration?: number;
  className?: string;
}

export function TextShimmer({
  children,
  as: Comp = "span",
  duration = 2.5,
  className,
}: TextShimmerProps) {
  const MotionComp = motionize(
    Comp as ComponentType<Record<string, unknown>>,
  ) as ElementType;
  return (
    <MotionComp
      className={cn("inline-block", TEXT_SHIMMER_CLASS_NAME, className)}
      animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
      transition={{ repeat: Infinity, duration, ease: "linear" }}
    >
      {children}
    </MotionComp>
  );
}
