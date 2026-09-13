import * as React from "react";

import { cn } from "@/lib/utils";
import { AnimatePresence, m } from "motion/react";
import type { MotionProps, Transition, Variants } from "motion/react";

export const springFast: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 34,
  mass: 0.5,
};

export const springSoft: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 28,
  mass: 0.8,
};

export const easeOutFast: Transition = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1],
};

export const easeOutSoft: Transition = {
  duration: 0.26,
  ease: [0.22, 1, 0.36, 1],
};

export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const overlayTransition: Transition = { duration: 0.14, ease: "easeOut" };

export const popVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1 },
};

const sideOffsets = {
  top: { x: 0, y: 6 },
  bottom: { x: 0, y: -6 },
  left: { x: 6, y: 0 },
  right: { x: -6, y: 0 },
} as const;

export type PopSide = keyof typeof sideOffsets;

export function popperVariants(side: PopSide = "bottom"): Variants {
  const offset = sideOffsets[side];
  return {
    hidden: { opacity: 0, scale: 0.95, ...offset },
    visible: { opacity: 1, scale: 1, x: 0, y: 0 },
  };
}

export function useControllableOpen({
  open,
  defaultOpen,
  onOpenChange,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (next: boolean) => void;
}) {
  const [internal, setInternal] = React.useState(defaultOpen ?? false);
  const isControlled = open !== undefined;
  const value = isControlled ? open : internal;
  const change = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternal(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );
  return [value, change] as const;
}

export function createOpenContext(name: string) {
  const Context = React.createContext<boolean | undefined>(undefined);
  Context.displayName = `${name}OpenContext`;
  const useOpen = () => React.useContext(Context);
  return [Context.Provider, useOpen] as const;
}

export function Spin({
  active = true,
  duration = 0.9,
  className,
  children,
}: {
  active?: boolean;
  duration?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex origin-center", active && "animate-spin", className)}
      style={{ animationDuration: `${duration}s` }}
    >
      {children}
    </span>
  );
}

export function Pulse({
  className,
  children,
  duration = 1.6,
  style,
}: {
  className?: string;
  children?: React.ReactNode;
  duration?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("animate-pulse", className)}
      style={{ ...style, animationDuration: `${duration}s` }}
    >
      {children}
    </div>
  );
}

export function FadeIn({
  children,
  delay = 0,
  y = 8,
  className,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <m.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springSoft, delay }}
    >
      {children}
    </m.div>
  );
}

export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <m.div
          key="collapse"
          className={className}
          style={{ overflow: "hidden" }}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={easeOutSoft}
        >
          {children}
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

export function useDataStateOpen(
  ref: React.RefObject<HTMLElement | null>,
  attribute = "data-state",
) {
  const [open, setOpen] = React.useState(false);
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const read = () => setOpen(node.getAttribute(attribute) === "open");
    read();
    const observer = new MutationObserver(read);
    observer.observe(node, { attributes: true, attributeFilter: [attribute] });
    return () => observer.disconnect();
  }, [ref, attribute]);
  return open;
}

export function Rotate({
  open,
  children,
  className,
  angle = 180,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  angle?: number;
}) {
  return (
    <m.span
      className={className}
      style={{ display: "inline-flex" }}
      animate={{ rotate: open ? angle : 0 }}
      transition={springFast}
    >
      {children}
    </m.span>
  );
}

export const spinTransition: Transition = {
  repeat: Infinity,
  ease: "linear",
  duration: 0.9,
};

export const pulseTransition: Transition = {
  repeat: Infinity,
  ease: "easeInOut",
  duration: 1.6,
};

export const pulseKeyframes = { opacity: [1, 0.45, 1] };

const motionComponentCache = new WeakMap<
  React.ComponentType<never>,
  React.ComponentType<never>
>();

export function motionize<P>(component: React.ComponentType<P>) {
  type Motionized = React.ComponentType<P & MotionProps>;
  const key = component as unknown as React.ComponentType<never>;
  const cached = motionComponentCache.get(key);
  if (cached) return cached as unknown as Motionized;
  const created = m.create(component) as unknown as React.ComponentType<never>;
  // Der Cast oben umgeht die Typpruefung: kommt hier ein fehlgeschlagener
  // Import (undefined) oder ein String-Tag an, wirft WeakMap.set ein
  // "Invalid value used as weak map key" und verdeckt damit die eigentliche
  // Ursache. Ohne Objekt-Key wird nicht gecacht, und React meldet den echten
  // Fehler ("Element type is invalid") an der Stelle, an der er entsteht.
  if (isCacheableKey(key)) motionComponentCache.set(key, created);
  return created as unknown as Motionized;
}

function isCacheableKey(value: unknown): value is React.ComponentType<never> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

type IconLike = React.ComponentType<React.SVGProps<SVGSVGElement>>;

type MotionIconProps = React.SVGProps<SVGSVGElement> & {
  icon: IconLike;
  active?: boolean;
};

export function SpinIcon({ icon: Icon, active = true, className, ...props }: MotionIconProps) {
  return <Icon {...props} className={cn(active && "animate-spin", className)} />;
}

export function PulseIcon({ icon: Icon, active = true, className, ...props }: MotionIconProps) {
  return <Icon {...props} className={cn(active && "animate-pulse", className)} />;
}

export function StaggerItem({
  index = 0,
  children,
  className,
}: {
  index?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...easeOutSoft, delay: Math.min(index, 14) * 0.025 }}
    >
      {children}
    </m.div>
  );
}

export function staggerEnter(index: number) {
  return {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { ...easeOutSoft, delay: Math.min(index, 14) * 0.025 },
  };
}
