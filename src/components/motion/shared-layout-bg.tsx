// beui.dev/components/motion/shared-layout-bg
//
// A single highlight pill that glides between rows as the pointer moves,
// instead of every row painting its own hover background. One animated node
// for the whole list — the cheap way to make a long list feel alive.
//
// Two shapes are exported. `SharedLayoutBg` clones its children and is the
// drop-in beui form. `SharedLayoutBgRoot` + `SharedLayoutBgItem` split the
// same behaviour into a provider and an item so a virtualized list — whose
// rows are mounted and unmounted by a virtualizer, not by this component —
// can use it too.

import { AnimatePresence, m, useReducedMotion, type Variants } from "motion/react";
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { SPRING_LAYOUT } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

const variants: Variants = {
  initial: { opacity: 0, filter: "blur(6px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: (isActive: boolean) => (!isActive ? { opacity: 0, filter: "blur(6px)" } : {}),
};

const reducedVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: (isActive: boolean) => (!isActive ? { opacity: 0 } : {}),
};

type SharedLayoutBgContextValue = {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  layoutId: string;
  inset: number;
  pillClassName?: string;
};

const SharedLayoutBgContext = createContext<SharedLayoutBgContextValue | null>(null);

export interface SharedLayoutBgRootProps {
  children: ReactNode;
  className?: string;
  /** Tailwind class applied to the moving pill. */
  pillClassName?: string;
  /** Horizontal bleed of the pill past each row, in px. */
  inset?: number;
}

export function SharedLayoutBgRoot({
  children,
  className,
  pillClassName,
  inset = 0,
}: SharedLayoutBgRootProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const uid = useId();
  const value = useMemo<SharedLayoutBgContextValue>(
    () => ({ activeId, setActiveId, layoutId: `shared-bg-${uid}`, inset, pillClassName }),
    [activeId, inset, pillClassName, uid],
  );

  // layoutRoot scopes the pill's layout projection to this list, so a scrolled
  // ancestor cannot smear its scroll offset into the pill's movement.
  return (
    <m.div
      layoutRoot
      onMouseLeave={() => setActiveId(null)}
      className={cn("w-full", className)}
    >
      <SharedLayoutBgContext.Provider value={value}>{children}</SharedLayoutBgContext.Provider>
    </m.div>
  );
}

export interface SharedLayoutBgItemProps {
  /** Stable identity for this row. The pill glides to whichever id is hovered. */
  id: string;
  children: ReactNode;
  className?: string;
}

export function SharedLayoutBgItem({ id, children, className }: SharedLayoutBgItemProps) {
  const context = useContext(SharedLayoutBgContext);
  const reduce = useReducedMotion();
  if (!context) return <div className={className}>{children}</div>;

  const { activeId, setActiveId, layoutId, inset, pillClassName } = context;
  const anyActive = activeId !== null;

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={() => setActiveId(id)}
      onFocusCapture={() => setActiveId(id)}
    >
      <AnimatePresence custom={anyActive}>
        {anyActive ? (
          <m.div
            variants={reduce ? reducedVariants : variants}
            initial="initial"
            animate="animate"
            exit="exit"
            custom={anyActive}
            className="pointer-events-none absolute inset-y-0"
            style={{ left: -inset, right: -inset }}
          >
            {activeId === id ? (
              <m.div
                layoutId={layoutId}
                transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                className={cn(
                  "pointer-events-none h-full w-full rounded-[var(--ag-r-sm)] bg-[var(--ag-hover)]",
                  pillClassName,
                )}
              />
            ) : null}
          </m.div>
        ) : null}
      </AnimatePresence>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export interface SharedLayoutBgProps extends SharedLayoutBgRootProps {
  children: ReactNode;
}

/**
 * Drop-in form: wraps a static list of children, each of which becomes a row
 * the pill can settle on. For a virtualized list use SharedLayoutBgRoot and
 * SharedLayoutBgItem directly.
 */
export function SharedLayoutBg({ children, className, ...rest }: SharedLayoutBgProps) {
  return (
    <SharedLayoutBgRoot {...rest} className={cn("flex flex-col", className)}>
      {Children.toArray(children)
        .filter(isValidElement)
        .map((child, index) => {
          const element = child as ReactElement<{ className?: string }>;
          const key = element.key ? String(element.key) : `item-${index}`;
          return (
            <SharedLayoutBgItem key={key} id={key}>
              {cloneElement(element)}
            </SharedLayoutBgItem>
          );
        })}
    </SharedLayoutBgRoot>
  );
}
