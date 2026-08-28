import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"
import { AnimatePresence, m } from "motion/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import {
  createOpenContext,
  overlayTransition,
  overlayVariants,
  springSoft,
  useControllableOpen,
} from "@/components/motion/kit"

const [SheetOpenProvider, useSheetOpen] = createOpenContext("Sheet")

const sheetOffscreen = {
  top: { y: "-100%", x: 0 },
  bottom: { y: "100%", x: 0 },
  left: { x: "-100%", y: 0 },
  right: { x: "100%", y: 0 },
} as const

function Sheet({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Root>) {
  const [value, change] = useControllableOpen({ open, defaultOpen, onOpenChange })
  return (
    <SheetOpenProvider value={value}>
      <SheetPrimitive.Root
        data-slot="sheet"
        open={value}
        onOpenChange={change}
        {...props}
      />
    </SheetOpenProvider>
  )
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay data-slot="sheet-overlay" forceMount asChild {...props}>
      <m.div
        className={cn(
          "fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
          className
        )}
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={overlayTransition}
      />
    </SheetPrimitive.Overlay>
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  const isOpen = useSheetOpen()
  const offscreen = sheetOffscreen[side]
  return (
    <AnimatePresence>
      {isOpen ? (
        <SheetPortal key="sheet-portal" forceMount>
          <SheetOverlay />
          <SheetPrimitive.Content
            data-slot="sheet-content"
            data-side={side}
            forceMount
            asChild
            {...props}
          >
            <m.div
              className={cn(
                "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
                className
              )}
              initial={{ ...offscreen, opacity: 0 }}
              animate={{ x: 0, y: 0, opacity: 1 }}
              exit={{ ...offscreen, opacity: 0 }}
              transition={springSoft}
            >
              {children}
              {showCloseButton && (
                <SheetPrimitive.Close data-slot="sheet-close" asChild>
                  <Button
                    variant="ghost"
                    className="absolute top-3 right-3"
                    size="icon-sm"
                  >
                    <XIcon />
                    <span className="sr-only">Close</span>
                  </Button>
                </SheetPrimitive.Close>
              )}
            </m.div>
          </SheetPrimitive.Content>
        </SheetPortal>
      ) : null}
    </AnimatePresence>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
