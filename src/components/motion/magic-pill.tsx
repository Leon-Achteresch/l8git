import { m } from "motion/react";

export function MagicPill({
  layoutId,
  className,
}: {
  layoutId: string;
  className?: string;
}) {
  return (
    <m.span
      layoutId={layoutId}
      aria-hidden
      transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.7 }}
      className={className}
    />
  );
}
