import { AnimatePresence, m } from "motion/react";
import type { ReactNode } from "react";

export function PanelSwap({
  panelKey,
  children,
  className,
}: {
  panelKey: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={panelKey}
        className={className}
        initial={{ opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -14 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
