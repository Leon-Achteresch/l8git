import type { ReactNode } from "react";

// Replaces the former motion.span clip-path reveal. Virtualised commit lists
// mount/unmount this component on every scroll; using a CSS keyframe avoids
// the motion runtime cost per row. prefers-reduced-motion handled globally.
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
    <span
      className={className}
      style={{
        display: "inline-block",
        animation:
          "l8git-tape-reveal 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
        animationDelay: delay ? `${delay}s` : undefined,
      }}
    >
      {children}
    </span>
  );
}
