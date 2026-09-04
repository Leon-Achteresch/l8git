import { cn } from "@/lib/utils"
import { m, type HTMLMotionProps } from "motion/react"
import { pulseKeyframes, pulseTransition } from "@/components/motion/kit"

type SkeletonProps = HTMLMotionProps<"div"> & {
  /** Shimmer sweep (premium) vs plain pulse. Defaults to shimmer for perceived speed. */
  shimmer?: boolean
}

function Skeleton({ className, shimmer = true, ...props }: SkeletonProps) {
  return (
    <m.div
      data-slot="skeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={cn(
        "rounded-md bg-muted",
        shimmer && "l8-shimmer",
        className
      )}
      animate={shimmer ? undefined : pulseKeyframes}
      transition={shimmer ? undefined : pulseTransition}
      {...props}
    />
  )
}

function SkeletonText({
  className,
  lines = 3,
  ...props
}: React.ComponentProps<"div"> & { lines?: number }) {
  return (
    <div
      data-slot="skeleton-text"
      aria-hidden
      className={cn("flex flex-col gap-2", className)}
      {...props}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3",
            i === lines - 1 ? "w-2/3" : "w-full",
            i % 3 === 1 && "w-11/12"
          )}
        />
      ))}
    </div>
  )
}

function SkeletonRows({
  className,
  rows = 5,
  ...props
}: React.ComponentProps<"div"> & { rows?: number }) {
  return (
    <div
      data-slot="skeleton-rows"
      aria-hidden
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-1 py-1">
          <Skeleton className="size-7 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton
              className="h-3"
              style={{ width: `${72 - ((i * 13) % 28)}%` }}
            />
            <Skeleton
              className="h-2 opacity-70"
              style={{ width: `${42 - ((i * 7) % 18)}%` }}
            />
          </div>
          <Skeleton className="h-5 w-14 shrink-0 rounded-full opacity-80" />
        </div>
      ))}
    </div>
  )
}

export { Skeleton, SkeletonRows, SkeletonText }
