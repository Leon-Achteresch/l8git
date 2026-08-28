import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { AnimatePresence, m } from "motion/react"

import { cn } from "@/lib/utils"
import {
  createOpenContext,
  popperVariants,
  springFast,
  useControllableOpen,
  type PopSide,
} from "@/components/motion/kit"

const [PopoverOpenProvider, usePopoverOpen] = createOpenContext("Popover")

function Popover({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const [value, change] = useControllableOpen({ open, defaultOpen, onOpenChange })
  return (
    <PopoverOpenProvider value={value}>
      <PopoverPrimitive.Root
        data-slot="popover"
        open={value}
        onOpenChange={change}
        {...props}
      />
    </PopoverOpenProvider>
  )
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  side = "bottom",
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const isOpen = usePopoverOpen()
  return (
    <AnimatePresence>
      {isOpen ? (
        <PopoverPrimitive.Portal key="popover-portal" forceMount>
          <PopoverPrimitive.Content
            data-slot="popover-content"
            align={align}
            side={side}
            sideOffset={sideOffset}
            forceMount
            asChild
            {...props}
          >
            <m.div
              className={cn(
                "z-50 flex w-72 max-w-(--radix-popover-content-available-width) flex-col gap-2.5 rounded-2xl bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden",
                className
              )}
              style={{
                transformOrigin: "var(--radix-popover-content-transform-origin)",
              }}
              variants={popperVariants(side as PopSide)}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={springFast}
            >
              {children}
            </m.div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
