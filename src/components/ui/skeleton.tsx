import { cn } from "@/lib/utils"
import { m, type HTMLMotionProps } from "motion/react"
import { pulseKeyframes, pulseTransition } from "@/components/motion/kit"

function Skeleton({ className, ...props }: HTMLMotionProps<"div">) {
  return (
    <m.div
      data-slot="skeleton"
      className={cn("rounded-md bg-muted", className)}
      animate={pulseKeyframes}
      transition={pulseTransition}
      {...props}
    />
  )
}

export { Skeleton }
