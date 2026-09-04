"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ActionSwapRollText } from "@/components/motion/action-swap-roll";
import { AgentDisclosure } from "@/components/agents/ui/agent-disclosure";
import { TodoHeaderIcon } from "@/components/agents/ui/todo-header-icon";
import {
  TodoStatusIcon,
  type TodoItemStatus,
} from "@/components/agents/ui/todo-status-icon";
import {
  EASE_OUT,
  SPRING_LAYOUT,
  SPRING_SWAP,
} from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export type { TodoItemStatus };

export interface TodoItem {
  id: string;
  title: ReactNode;
  status?: TodoItemStatus;
  progress?: number;
  detail?: ReactNode;
}

export interface TodoListProps {
  items: TodoItem[];
  title?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  collapseOnComplete?: boolean;
  maxHeight?: number;
  className?: string;
}

function statusLabel(status: TodoItemStatus) {
  if (status === "in-progress") return "In progress";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
}

export function TodoList({
  items,
  title = "To-dos",
  open,
  defaultOpen = true,
  onOpenChange,
  collapseOnComplete = true,
  maxHeight = 248,
  className,
}: TodoListProps) {
  const reduce = useReducedMotion() ?? false;
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousComplete = useRef(false);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const currentOpen = open ?? internalOpen;
  const completed = items.filter((item) => item.status === "completed").length;
  const allComplete = items.length > 0 && completed === items.length;
  const itemCount = items.length;

  const setOpen = useCallback(
    (next: boolean) => {
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange, open],
  );

  useEffect(() => {
    if (previousComplete.current && !allComplete) {
      setOpen(true);
    }
    if (!previousComplete.current && allComplete && collapseOnComplete) {
      setOpen(false);
    }
    previousComplete.current = allComplete;
  }, [allComplete, collapseOnComplete, setOpen]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !currentOpen || itemCount === 0) return;

    const frame = requestAnimationFrame(() => {
      if (viewport.scrollHeight <= viewport.clientHeight) return;
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [currentOpen, itemCount]);

  return (
    <section
      aria-label="Agent task list"
      className={cn("rounded-[var(--ag-r-md)] border border-[var(--ag-line)] bg-[var(--ag-surface)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08)] transition-[transform,border-color,box-shadow] duration-200 hover:border-[var(--ag-line-strong)] w-full overflow-hidden", className)}
    >
      <button
        id={triggerId}
        type="button"
        aria-expanded={currentOpen}
        aria-controls={contentId}
        onClick={() => setOpen(!currentOpen)}
        className="group flex h-10 w-full items-center gap-2.5 px-3 text-left outline-none transition-colors hover:bg-[var(--ag-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <TodoHeaderIcon complete={allComplete} />
        <h3 className="min-w-0 flex-1 truncate text-[12px] font-medium">
          {title}
        </h3>
        <span
          className={cn(
            "shrink-0 text-[11px] font-medium tabular-nums text-[var(--ag-text-2)]",
            allComplete && "text-[var(--git-added)]",
          )}
        >
          <span className="sr-only">
            {completed} of {items.length} tasks completed
          </span>
          <span aria-hidden="true" className="inline-flex">
            <ActionSwapRollText value={String(completed)}>
              {completed}
            </ActionSwapRollText>
            <span>/</span>
            <span>{items.length}</span>
          </span>
        </span>
        <m.span
          aria-hidden="true"
          animate={{ rotate: currentOpen ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : SPRING_SWAP}
          className="text-[var(--ag-text-3)] transition-colors group-hover:text-[var(--ag-text-2)]"
        >
          <ChevronDown className="size-3.5" />
        </m.span>
      </button>

      <AgentDisclosure
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        open={currentOpen}
      >
        {currentOpen ? (
          <div
            ref={viewportRef}
            className="border-[var(--ag-line)] scrollbar-hide overflow-y-auto border-t px-2 py-1.5"
            style={{ maxHeight }}
          >
            {items.length ? (
              <ol aria-live="polite" className="space-y-0">
                <AnimatePresence initial={false} mode="popLayout">
                  {items.map((item) => {
                    const status = item.status ?? "pending";
                    return (
                      <m.li
                        layout="position"
                        key={item.id}
                        initial={
                          reduce ? { opacity: 1 } : { opacity: 0, y: 6 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
                        transition={
                          reduce
                            ? { duration: 0 }
                            : {
                                opacity: { duration: 0.18, ease: EASE_OUT },
                                y: SPRING_LAYOUT,
                                layout: SPRING_LAYOUT,
                              }
                        }
                        className="flex min-h-9 items-center gap-2.5 rounded-xl px-1.5 py-1"
                      >
                        <TodoStatusIcon
                          status={status}
                          progress={item.progress}
                        />
                        <span className="sr-only">
                          {statusLabel(status)}:{" "}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-[13px] leading-5",
                            status === "pending" && "text-[var(--ag-text-3)]",
                            status === "in-progress" && "text-[var(--ag-text)]",
                            status === "completed" && "text-[var(--ag-text-3)]",
                            status === "cancelled" && "text-[var(--ag-text-3)]",
                          )}
                        >
                          <span className="relative inline-block max-w-full">
                            {item.title}
                            <m.span
                              aria-hidden="true"
                              initial={false}
                              animate={{
                                scaleX: status === "completed" ? 1 : 0,
                                opacity: status === "completed" ? 1 : 0,
                              }}
                              transition={
                                reduce
                                  ? { duration: 0 }
                                  : {
                                      duration: 0.28,
                                      ease: EASE_OUT,
                                      delay: 0.06,
                                    }
                              }
                              className="absolute inset-x-0 top-1/2 h-px origin-left bg-current"
                            />
                          </span>
                        </span>
                        {item.detail ? (
                          <span className="shrink-0 text-sm text-muted-foreground/55">
                            {item.detail}
                          </span>
                        ) : null}
                      </m.li>
                    );
                  })}
                </AnimatePresence>
              </ol>
            ) : (
              <p className="px-1.5 py-2 text-sm text-muted-foreground">
                No tasks yet
              </p>
            )}
          </div>
        ) : null}
      </AgentDisclosure>
    </section>
  );
}
