"use client"

import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "radix-ui"
import { AnimatePresence, m } from "motion/react"

import { easeOutSoft, useDataStateOpen } from "@/components/motion/kit"

const CollapsibleOpenContext = React.createContext(false)

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  const ref = React.useRef<HTMLDivElement>(null)
  const open = useDataStateOpen(ref)
  return (
    <CollapsibleOpenContext.Provider value={open}>
      <CollapsiblePrimitive.Root ref={ref} data-slot="collapsible" {...props} />
    </CollapsibleOpenContext.Provider>
  )
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

function CollapsibleContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  const open = React.useContext(CollapsibleOpenContext)
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <CollapsiblePrimitive.CollapsibleContent
          key="collapsible-content"
          data-slot="collapsible-content"
          forceMount
          asChild
          {...props}
        >
          <m.div
            className={className}
            style={{ overflow: "hidden" }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={easeOutSoft}
          >
            {children}
          </m.div>
        </CollapsiblePrimitive.CollapsibleContent>
      ) : null}
    </AnimatePresence>
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
