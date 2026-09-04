"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const isIndeterminate = value === undefined || value === null
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isIndeterminate ? undefined : Math.round(Number(value) || 0)}
      aria-valuetext={
        isIndeterminate ? "Loading" : `${Math.round(Number(value) || 0)} percent`
      }
      className={cn(
        "relative flex h-1 w-full items-center overflow-hidden rounded-full bg-muted",
        className
      )}
      value={isIndeterminate ? undefined : (value ?? undefined)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "size-full flex-1 rounded-full bg-primary transition-transform duration-300 ease-out",
          isIndeterminate && "l8-shimmer opacity-60"
        )}
        style={
          isIndeterminate
            ? { transform: "translateX(-50%)", width: "50%" }
            : { transform: `translateX(-${100 - (value || 0)}%)` }
        }
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
