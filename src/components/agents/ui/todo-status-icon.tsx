import { m, useReducedMotion } from "motion/react";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export type TodoItemStatus =
  | "pending"
  | "in-progress"
  | "completed"
  | "cancelled";

export function TodoStatusIcon({
  status,
  progress,
}: {
  status: TodoItemStatus;
  progress?: number;
}) {
  const reduce = useReducedMotion() ?? false;
  const normalizedProgress =
    progress === undefined ? 0.68 : Math.min(100, Math.max(0, progress)) / 100;

  return (
    <m.svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      initial={false}
      className={cn(
        "mx-0.5 size-5 shrink-0 overflow-visible text-[var(--ag-text-3)]",
        status === "in-progress" && "text-[var(--ag-text)]",
        status === "cancelled" && "text-[var(--git-removed)]",
      )}
    >
      <m.circle
        cx="12"
        cy="12"
        r="9"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={status === "pending" ? "2 3" : undefined}
        strokeLinecap="round"
        initial={false}
        animate={{ fillOpacity: status === "completed" ? 0.06 : 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT }}
        className={cn(status === "in-progress" && "opacity-20")}
      />
      <m.circle
        cx="12"
        cy="12"
        r="9"
        pathLength="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        initial={false}
        animate={{
          pathLength: status === "in-progress" ? normalizedProgress : 0,
          opacity: status === "in-progress" ? 1 : 0,
          rotate:
            status === "in-progress" && progress === undefined && !reduce
              ? 360
              : -90,
        }}
        transition={
          status === "in-progress" && progress === undefined && !reduce
            ? { rotate: { duration: 1.1, repeat: Infinity, ease: "linear" } }
            : reduce
              ? { duration: 0 }
              : SPRING_LAYOUT
        }
        style={{ transformOrigin: "12px 12px" }}
      />
      <m.path
        d="M7.5 12.25 10.5 15.25 16.75 8.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{
          pathLength: status === "completed" ? 1 : 0,
          opacity: status === "completed" ? 1 : 0,
        }}
        transition={reduce ? { duration: 0 } : { duration: 0.24, ease: EASE_OUT }}
      />
      <m.path
        d="M8.5 8.5 15.5 15.5M15.5 8.5 8.5 15.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        initial={false}
        animate={{
          pathLength: status === "cancelled" ? 1 : 0,
          opacity: status === "cancelled" ? 1 : 0,
        }}
        transition={reduce ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
      />
    </m.svg>
  );
}
