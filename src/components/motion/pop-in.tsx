import type { ReactNode } from "react";

// Originally a spring-animated motion.span used on every commit branch badge.
// In a virtualised commit list the badge mounts on every scroll tick, which
// triggered a fresh spring animation per row — very expensive on weak GPUs.
// The CSS keyframe below fires once per mount and is composited on the GPU
// thread; prefers-reduced-motion is honoured globally in index.css.
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
    <span
      title={title}
      className={className}
      style={{
        display: "inline-flex",
        transformOrigin: "center",
        animation: "l8git-pop-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both",
        animationDelay: delay ? `${delay}s` : undefined,
      }}
    >
      {children}
    </span>
  );
}
