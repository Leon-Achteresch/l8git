import * as React from "react"
import { Accordion as AccordionPrimitive } from "radix-ui"
import { AnimatePresence, m } from "motion/react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Rotate, easeOutSoft, useDataStateOpen } from "@/components/motion/kit"

const AccordionItemOpenContext = React.createContext(false)

function Accordion({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("w-full", className)}
      {...props}
    />
  )
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  const ref = React.useRef<HTMLDivElement>(null)
  const open = useDataStateOpen(ref)
  return (
    <AccordionItemOpenContext.Provider value={open}>
      <AccordionPrimitive.Item
        ref={ref}
        data-slot="accordion-item"
        className={cn(className)}
        {...props}
      />
    </AccordionItemOpenContext.Provider>
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  const open = React.useContext(AccordionItemOpenContext)
  return (
    <AccordionPrimitive.Header className="flex w-full min-w-0">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group flex min-h-0 min-w-0 flex-1 items-center justify-between gap-3 rounded-md py-3 pr-1 text-left text-sm font-medium outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
        <Rotate open={open} className="pointer-events-none shrink-0">
          <ChevronDown className="size-4 text-muted-foreground" />
        </Rotate>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  const open = React.useContext(AccordionItemOpenContext)
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <AccordionPrimitive.Content
          key="accordion-content"
          data-slot="accordion-content"
          forceMount
          asChild
          {...props}
        >
          <m.div
            className={cn("text-sm", className)}
            style={{ overflow: "hidden" }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={easeOutSoft}
          >
            <div className="pt-0 pb-4">{children}</div>
          </m.div>
        </AccordionPrimitive.Content>
      ) : null}
    </AnimatePresence>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
