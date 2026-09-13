import { m } from "motion/react";
import type { ReactNode } from "react";

export function PopIn({
  children,
  delay = 0,
  className,
  title,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  title?: string;
}) {
  return (
    <m.span
      title={title}
      className={className}
      style={{ display: "inline-flex", transformOrigin: "center" }}
      initial={{ opacity: 0, scale: 0.82 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </m.span>
  );
}
