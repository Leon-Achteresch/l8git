import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { SPRING_PRESS } from "@/lib/motion/ease";

export function ResponseAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;

  return (
    <m.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.9 }}
      transition={SPRING_PRESS}
      className="ag-icon-btn"
    >
      {children}
    </m.button>
  );
}
