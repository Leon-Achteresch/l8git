import type { ReactNode } from "react";
import { TextShimmer } from "@/components/motion/text-shimmer";
import { cn } from "@/lib/utils";

export interface ThinkingShimmerProps {
  children?: ReactNode;
  duration?: number;
  className?: string;
}

export function ThinkingShimmer({
  children = "Thinking…",
  duration = 1.8,
  className,
}: ThinkingShimmerProps) {
  return (
    <TextShimmer
      as="span"
      duration={duration}
      className={cn("font-medium", className)}
    >
      {children}
    </TextShimmer>
  );
}
