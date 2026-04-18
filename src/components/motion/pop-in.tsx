import { motion } from "motion/react";
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
    <motion.span
      title={title}
      initial={{ opacity: 0, scale: 0.55, rotate: -6 }}
      whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
      viewport={{ once: true, margin: "120px" }}
      transition={{
        type: "spring",
        stiffness: 520,
        damping: 22,
        mass: 0.5,
        delay,
      }}
      className={className}
      style={{ display: "inline-flex", transformOrigin: "center" }}
    >
      {children}
    </motion.span>
  );
}
