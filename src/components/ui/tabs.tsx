import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { m } from "motion/react"

import { cn } from "@/lib/utils"
import { easeOutSoft, springFast } from "@/components/motion/kit"

const TabsValueContext = React.createContext<string | undefined>(undefined)

const TabsListContext = React.createContext<{
  layoutId: string
  variant: "default" | "line"
} | null>(null)

function Tabs({
  className,
  orientation = "horizontal",
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [internal, setInternal] = React.useState(defaultValue)
  const current = value !== undefined ? value : internal
  const change = React.useCallback(
    (next: string) => {
      if (value === undefined) setInternal(next)
      onValueChange?.(next)
    },
    [value, onValueChange]
  )
  return (
    <TabsValueContext.Provider value={current}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        value={current}
        onValueChange={change}
        className={cn(
          "group/tabs flex gap-2 data-horizontal:flex-col",
          className
        )}
        {...props}
      />
    </TabsValueContext.Provider>
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const layoutId = React.useId()
  const value = React.useMemo(
    () => ({ layoutId, variant: (variant ?? "default") as "default" | "line" }),
    [layoutId, variant]
  )
  return (
    <TabsListContext.Provider value={value}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      />
    </TabsListContext.Provider>
  )
}

function TabsTrigger({
  className,
  children,
  value,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const ctx = React.useContext(TabsListContext)
  const active = React.useContext(TabsValueContext) === value

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "data-active:text-foreground dark:data-active:text-foreground",
        className
      )}
      {...props}
    >
      {active && ctx ? (
        ctx.variant === "line" ? (
          <m.span
            layoutId={`${ctx.layoutId}-line`}
            className="pointer-events-none absolute inset-x-0 -bottom-[5px] h-0.5 rounded-full bg-foreground group-data-vertical/tabs:inset-y-0 group-data-vertical/tabs:-right-1 group-data-vertical/tabs:left-auto group-data-vertical/tabs:h-auto group-data-vertical/tabs:w-0.5"
            transition={springFast}
          />
        ) : (
          <m.span
            layoutId={`${ctx.layoutId}-pill`}
            className="pointer-events-none absolute inset-0 -z-10 rounded-md bg-background shadow-sm dark:border dark:border-input dark:bg-input/30"
            transition={springFast}
          />
        )
      ) : null}
      <span className="relative inline-flex items-center gap-1.5">
        {children}
      </span>
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content data-slot="tabs-content" asChild {...props}>
      <m.div
        className={cn("flex-1 text-sm outline-none", className)}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={easeOutSoft}
      >
        {children}
      </m.div>
    </TabsPrimitive.Content>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
