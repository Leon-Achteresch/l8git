import { motion } from "motion/react";
import type { ReactNode } from "react";

export function TapeReveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.span
      initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
      whileInView={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
      viewport={{ once: true, margin: "120px" }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
      style={{ display: "inline-block", willChange: "clip-path, opacity" }}
    >
      {children}
    </motion.span>
  );
}
