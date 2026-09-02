"use client";

import {
  Ban,
  Braces,
  Check,
  ChevronDown,
  CircleCheck,
  CircleX,
  Copy,
  LoaderCircle,
  RotateCcw,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import { m, useReducedMotion } from "motion/react";
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
import { ToolResultAction } from "@/components/agents/ui/tool-result-action";
import { ToolResultOutput } from "@/components/agents/ui/tool-result-output";
import { SPRING_SWAP } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";
import { SpinIcon } from "@/components/motion/kit";

export { ToolResultOutput };
export type { ToolResultOutputProps } from "@/components/agents/ui/tool-result-output";

export type ToolResultStatus = "running" | "success" | "error" | "cancelled";
export type ToolResultKind = "terminal" | "request" | "custom";

export interface ToolResultProps {
  tool: string;
  title: string;
  children: ReactNode;
  status?: ToolResultStatus;
  kind?: ToolResultKind;
  meta?: ReactNode;
  icon?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  collapseOnComplete?: boolean;
  maxHeight?: number | string;
  copyText?: string;
  onCopy?: () => void | Promise<void>;
  onRetry?: () => void;
  className?: string;
  contentClassName?: string;
}

function getStatusLabel(status: ToolResultStatus) {
  if (status === "running") return "Running";
  if (status === "success") return "Completed";
  if (status === "error") return "Failed";
  return "Cancelled";
}

function getSwapKey(value: ReactNode, fallback: string) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
}

function getStatusClass(status: ToolResultStatus) {
  if (status === "running") {
    return "text-blue-600 dark:text-blue-400";
  }
  if (status === "success") {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (status === "error") {
    return "text-rose-600 dark:text-rose-400";
  }
  return "text-muted-foreground";
}

function KindIcon({ kind }: { kind: ToolResultKind }) {
  if (kind === "terminal") return <SquareTerminal className="size-4" />;
  if (kind === "request") return <Braces className="size-4" />;
  return <Wrench className="size-4" />;
}

function StatusIcon({
  status,
  reduce,
}: {
  status: ToolResultStatus;
  reduce: boolean;
}) {
  if (status === "running") {
    return <SpinIcon icon={LoaderCircle} active={!reduce} className="size-3" />;
  }
  if (status === "success") return <CircleCheck className="size-3" />;
  if (status === "error") return <CircleX className="size-3" />;
  return <Ban className="size-3" />;
}

export function ToolResult({
  tool,
  title,
  children,
  status = "running",
  kind = "custom",
  meta,
  icon,
  open,
  defaultOpen = false,
  onOpenChange,
  collapseOnComplete = false,
  maxHeight = 280,
  copyText,
  onCopy,
  onRetry,
  className,
  contentClassName,
}: ToolResultProps) {
  const reduce = useReducedMotion() ?? false;
  const contentId = useId();
  const triggerId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(
    open ?? (status === "running" ? true : defaultOpen),
  );
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousStatus = useRef(status);

  const isControlled = open !== undefined;
  const currentOpen = isControlled ? open : uncontrolledOpen;
  const running = status === "running";
  const canCopy = Boolean(onCopy || copyText);
  const statusLabel = getStatusLabel(status);
  const titleKey = getSwapKey(title, "title");
  const metaKey = getSwapKey(meta, "meta");
  const toolKey = getSwapKey(tool, "tool");

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  useEffect(() => {
    if (open !== undefined) setUncontrolledOpen(open);
  }, [open]);

  useEffect(() => {
    if (previousStatus.current !== "running" && status === "running") {
      setOpen(true);
    }
    if (
      previousStatus.current === "running" &&
      status !== "running" &&
      collapseOnComplete
    ) {
      setOpen(false);
    }
    previousStatus.current = status;
  }, [collapseOnComplete, setOpen, status]);

  useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !currentOpen || !running) return;

    const frame = requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  });

  const handleCopy = useCallback(async () => {
    if (onCopy) await onCopy();
    else if (copyText) await navigator.clipboard?.writeText(copyText);

    setCopied(true);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  }, [copyText, onCopy]);

  return (
    <div
      data-state={status}
      aria-busy={running}
      className={cn("ag-card w-full overflow-hidden text-sm", className)}
    >
      <button
        id={triggerId}
        type="button"
        aria-expanded={currentOpen}
        aria-controls={contentId}
        onClick={() => setOpen(!currentOpen)}
        className="group flex h-9 w-full items-center gap-2 px-2.5 text-left outline-none transition-colors hover:bg-[var(--ag-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className="ag-faint grid size-4 shrink-0 place-items-center"
        >
          {icon ?? <KindIcon kind={kind} />}
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="min-w-0 truncate text-[12px] font-medium">
            <ActionSwapRollText value={titleKey}>{title}</ActionSwapRollText>
          </span>
          {meta ? (
            <span className="ag-faint shrink-0 truncate text-[11px]">
              <ActionSwapRollText value={metaKey}>{meta}</ActionSwapRollText>
            </span>
          ) : null}
          <span className="ag-faint hidden min-w-0 truncate font-mono text-[10px] sm:block">
            <ActionSwapRollText value={toolKey}>{tool}</ActionSwapRollText>
          </span>
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-[11px] font-medium",
            getStatusClass(status),
          )}
        >
          <StatusIcon status={status} reduce={reduce} />
          <ActionSwapRollText value={status}>{statusLabel}</ActionSwapRollText>
        </span>
        <m.span
          aria-hidden="true"
          animate={{ rotate: currentOpen ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : SPRING_SWAP}
          className="ag-faint shrink-0 transition-colors group-hover:text-[var(--ag-text-2)]"
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
        <div className="ag-line border-t bg-[var(--ag-surface-3)]">
          <div
            ref={viewportRef}
            role="log"
            aria-live="polite"
            className="scrollbar-hide overflow-y-auto"
            style={{ maxHeight }}
          >
            <div className={cn("p-3", contentClassName)}>
              {currentOpen ? children : null}
            </div>
          </div>

          {canCopy || onRetry ? (
            <div className="flex items-center gap-0.5 px-2 pb-1.5">
              {canCopy ? (
                <ToolResultAction
                  label={copied ? "Copied" : "Copy result"}
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </ToolResultAction>
              ) : null}
              {onRetry ? (
                <ToolResultAction label="Run again" onClick={onRetry}>
                  <RotateCcw className="size-3.5" />
                </ToolResultAction>
              ) : null}
              <span className="ag-faint ml-auto text-[11px]">
                <ActionSwapRollText value={status}>
                  {statusLabel}
                </ActionSwapRollText>
              </span>
            </div>
          ) : null}
        </div>
      </AgentDisclosure>
    </div>
  );
}
