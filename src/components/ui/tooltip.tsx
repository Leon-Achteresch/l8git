import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { AnimatePresence, m } from "motion/react";
import { cn } from "@/lib/utils";
import {
  createOpenContext,
  popperVariants,
  springFast,
  useControllableOpen,
  type PopSide,
} from "@/components/motion/kit";

const [TooltipOpenProvider, useTooltipOpen] = createOpenContext("Tooltip");

function TooltipProvider({
  delayDuration = 250,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

function Tooltip({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const [value, change] = useControllableOpen({ open, defaultOpen, onOpenChange });
  return (
    <TooltipProvider>
      <TooltipOpenProvider value={value}>
        <TooltipPrimitive.Root open={value} onOpenChange={change} {...props} />
      </TooltipOpenProvider>
    </TooltipProvider>
  );
}

function TooltipTrigger(
  props: React.ComponentProps<typeof TooltipPrimitive.Trigger>,
) {
  return <TooltipPrimitive.Trigger {...props} />;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const isOpen = useTooltipOpen();
  return (
    <AnimatePresence>
      {isOpen ? (
        <TooltipPrimitive.Portal key="tooltip-portal" forceMount>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={sideOffset}
            forceMount
            asChild
            {...props}
          >
            <m.div
              data-slot="tooltip-content"
              className={cn(
                "z-[80] max-w-[min(20rem),var(--radix-tooltip-content-available-width,20rem))] overflow-hidden rounded-lg border border-border/80 bg-popover px-2.5 py-1.5 text-xs break-words text-popover-foreground shadow-lg",
                className,
              )}
              style={{
                transformOrigin: "var(--radix-tooltip-content-transform-origin)",
              }}
              variants={popperVariants(side as PopSide)}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={springFast}
            >
              {children}
            </m.div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
