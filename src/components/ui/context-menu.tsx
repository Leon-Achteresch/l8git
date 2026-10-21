import * as React from "react"
import { ContextMenu as ContextMenuPrimitive, Slot } from "radix-ui"

import { AnimatePresence, m } from "motion/react"

import { cn } from "@/lib/utils"
import {
  createOpenContext,
  popperVariants,
  springFast,
  useControllableOpen,
} from "@/components/motion/kit"

const [ContextMenuOpenProvider, useContextMenuOpen] =
  createOpenContext("ContextMenu")
import { ChevronRightIcon, CheckIcon } from "lucide-react"

// `focus`: where focus was inside the trigger (child indices, tag), so it survives the remount.
type Replay = { x: number; y: number; focus: { path: number[]; tag: string } | null }
// True while the first right-click is replayed into the freshly mounted menu.
let replaying = false
// Set while a `deferMount` menu has not mounted Radix yet: the trigger calls it on the first right-click.
const DeferredMountContext = React.createContext<((replay: Replay) => void) | null>(null)
const ReplayContext = React.createContext<React.RefObject<Replay | null> | null>(null)

function ContextMenu({
  onOpenChange,
  deferMount = false,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root> & {
  /**
   * Mount Radix only on the first right-click. Every mounted menu adds document listeners that run
   * on each keystroke and costs a render, so rows of long lists set this. The trigger's element is
   * remounted once when the menu mounts.
   */
  deferMount?: boolean
}) {
  const [value, change] = useControllableOpen({ onOpenChange })
  const [mounted, setMounted] = React.useState(!deferMount)
  const replay = React.useRef<Replay | null>(null)
  const mount = React.useCallback((next: Replay) => {
    replay.current = next
    setMounted(true)
  }, [])
  if (!mounted) {
    return (
      <ReplayContext.Provider value={null}>
        <DeferredMountContext.Provider value={mount}>{props.children}</DeferredMountContext.Provider>
      </ReplayContext.Provider>
    )
  }
  return (
    <DeferredMountContext.Provider value={null}>
      <ReplayContext.Provider value={replay}>
        <ContextMenuOpenProvider value={value}>
          <ContextMenuPrimitive.Root
            data-slot="context-menu"
            onOpenChange={change}
            {...props}
          />
        </ContextMenuOpenProvider>
      </ReplayContext.Provider>
    </DeferredMountContext.Provider>
  )
}

const LONG_PRESS_MS = 700 // Radix's touch long-press delay

function focusWithin(root: Element, el: Element | null): Replay["focus"] {
  if (!el || !root.contains(el)) return null
  const path: number[] = []
  for (let node: Element = el; node !== root; node = node.parentElement!) {
    path.unshift(Array.prototype.indexOf.call(node.parentElement!.children, node))
  }
  return { path, tag: el.tagName }
}

function ContextMenuTrigger({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  const mount = React.useContext(DeferredMountContext)
  const replay = React.useContext(ReplayContext)
  const element = React.useRef<HTMLSpanElement | null>(null)
  const setRef = React.useCallback(
    (node: HTMLSpanElement | null) => {
      element.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )
  React.useLayoutEffect(() => {
    const pending = replay?.current
    const node = element.current
    if (!pending || !node) return
    replay.current = null
    // The first right-click arrived before Radix mounted: open the menu where it happened.
    if (pending.focus) {
      let target: Element | undefined = node
      for (const i of pending.focus.path) target = target?.children[i]
      // Fall back to the trigger if the remounted markup differs.
      ;(target instanceof HTMLElement && target.tagName === pending.focus.tag ? target : node).focus()
    }
    replaying = true
    try {
      node.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: pending.x, clientY: pending.y }))
    } finally {
      replaying = false
    }
  }, [replay])
  const longPress = React.useRef(0)
  const clearLongPress = () => window.clearTimeout(longPress.current)
  React.useEffect(() => clearLongPress, [])
  if (mount) {
    // Same element and attributes Radix renders for a closed menu.
    const { asChild, disabled, onContextMenu, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, style, ...rest } = props
    const Comp = asChild ? Slot.Root : "span"
    // Radix opens on a touch long press too; until it is mounted, start that press here.
    const endTouch =
      (handler?: React.PointerEventHandler<HTMLSpanElement>) => (event: React.PointerEvent<HTMLSpanElement>) => {
        handler?.(event)
        if (event.pointerType !== "mouse") clearLongPress()
      }
    return (
      <Comp
        data-state="closed"
        data-disabled={disabled ? "" : undefined}
        data-slot="context-menu-trigger"
        className={cn("select-none", className)}
        {...rest}
        ref={setRef}
        style={{ WebkitTouchCallout: "none", ...style }}
        onContextMenu={(event: React.MouseEvent<HTMLSpanElement>) => {
          onContextMenu?.(event)
          if (disabled || event.defaultPrevented) return
          event.preventDefault()
          clearLongPress()
          mount({ x: event.clientX, y: event.clientY, focus: focusWithin(event.currentTarget, document.activeElement) })
        }}
        onPointerDown={(event: React.PointerEvent<HTMLSpanElement>) => {
          onPointerDown?.(event)
          if (disabled || event.defaultPrevented || event.pointerType === "mouse") return
          clearLongPress()
          const point = { x: event.clientX, y: event.clientY, focus: null }
          longPress.current = window.setTimeout(() => mount(point), LONG_PRESS_MS)
        }}
        onPointerMove={endTouch(onPointerMove)}
        onPointerUp={endTouch(onPointerUp)}
        onPointerCancel={endTouch(onPointerCancel)}
      />
    )
  }
  const { onContextMenu } = props
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      className={cn("select-none", className)}
      ref={setRef}
      {...props}
      // The replayed first right-click already reached the consumer's handler as the real one.
      onContextMenu={onContextMenu && ((event) => { if (!replaying) onContextMenu(event) })}
    />
  )
}

function ContextMenuGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return (
    <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
  )
}

function ContextMenuPortal({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
  return (
    <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
  )
}

function ContextMenuSub({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
}

function ContextMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
  return (
    <ContextMenuPrimitive.RadioGroup
      data-slot="context-menu-radio-group"
      {...props}
    />
  )
}

function ContextMenuContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
}) {
  const isOpen = useContextMenuOpen()
  if (React.useContext(DeferredMountContext)) return null
  return (
    <AnimatePresence>
      {isOpen ? (
        <ContextMenuPrimitive.Portal key="context-menu-portal" forceMount>
          <ContextMenuPrimitive.Content
            data-slot="context-menu-content"
            forceMount
            asChild
            {...props}
          >
            <m.div
              className={cn(
                "z-[80] max-h-(--radix-context-menu-content-available-height) max-w-(--radix-context-menu-content-available-width) min-w-36 overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-border",
                className
              )}
              style={{
                transformOrigin:
                  "var(--radix-context-menu-content-transform-origin)",
              }}
              variants={popperVariants("bottom")}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={springFast}
            >
              {children}
            </m.div>
          </ContextMenuPrimitive.Content>
        </ContextMenuPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  )
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/context-menu-item relative flex min-w-0 cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus:*:[svg]:text-accent-foreground data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
    />
  )
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </ContextMenuPrimitive.SubTrigger>
  )
}

function ContextMenuSubContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPortal>
      <ContextMenuPrimitive.SubContent
        data-slot="context-menu-sub-content"
        asChild
        {...props}
      >
      <m.div
        className={cn(
          "z-[80] max-w-(--radix-context-menu-content-available-width) min-w-32 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg",
          className
        )}
        style={{
          transformOrigin: "var(--radix-context-menu-content-transform-origin)",
        }}
        variants={popperVariants("right")}
        initial="hidden"
        animate="visible"
        transition={springFast}
      >
        {children}
      </m.div>
      </ContextMenuPrimitive.SubContent>
    </ContextMenuPortal>
  )
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex min-w-0 cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute right-2">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon
          />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  )
}

function ContextMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot="context-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex min-w-0 cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon
          />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  )
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
        className
      )}
      {...props}
    />
  )
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/context-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
}
