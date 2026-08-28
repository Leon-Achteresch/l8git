import * as React from "react"
import { HoverCard as HoverCardPrimitive } from "radix-ui"
import { AnimatePresence, m } from "motion/react"

import { cn } from "@/lib/utils"
import {
  createOpenContext,
  popperVariants,
  springFast,
  useControllableOpen,
  type PopSide,
} from "@/components/motion/kit"

const [HoverCardOpenProvider, useHoverCardOpen] = createOpenContext("HoverCard")

function HoverCard({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  const [value, change] = useControllableOpen({ open, defaultOpen, onOpenChange })
  return (
    <HoverCardOpenProvider value={value}>
      <HoverCardPrimitive.Root
        data-slot="hover-card"
        open={value}
        onOpenChange={change}
        {...props}
      />
    </HoverCardOpenProvider>
  )
}

function HoverCardTrigger({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  )
}

function HoverCardContent({
  className,
  align = "center",
  side = "bottom",
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  const isOpen = useHoverCardOpen()
  return (
    <AnimatePresence>
      {isOpen ? (
        <HoverCardPrimitive.Portal
          key="hover-card-portal"
          data-slot="hover-card-portal"
          forceMount
        >
          <HoverCardPrimitive.Content
            data-slot="hover-card-content"
            align={align}
            side={side}
            sideOffset={sideOffset}
            forceMount
            asChild
            {...props}
          >
            <m.div
              className={cn(
                "z-50 w-64 max-w-(--radix-hover-card-content-available-width) rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden",
                className
              )}
              style={{
                transformOrigin:
                  "var(--radix-hover-card-content-transform-origin)",
              }}
              variants={popperVariants(side as PopSide)}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={springFast}
            >
              {children}
            </m.div>
          </HoverCardPrimitive.Content>
        </HoverCardPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
