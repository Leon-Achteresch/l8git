import { motion } from "motion/react";
import type { ReactNode } from "react";

export function StaggerCard({
  index,
  children,
  className,
}: {
  index: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22, rotateX: -14, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, rotateX: 0, filter: "blur(0px)" }}
      transition={{
        type: "spring",
        stiffness: 240,
        damping: 26,
        mass: 0.9,
        delay: 0.05 + index * 0.07,
      }}
      style={{
        transformPerspective: 900,
        transformOrigin: "top center",
        willChange: "transform, opacity, filter",
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
