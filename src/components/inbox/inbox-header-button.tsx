import { Inbox, XIcon } from "lucide-react";
import { LayoutGroup, m, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { InboxPopup } from "@/components/inbox/inbox-popup";
import { Button } from "@/components/ui/button";
import { OverlayPortal, useAnchorBox } from "@/components/ui/overlay-portal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { inboxBadgeCount } from "@/lib/inbox";
import { useInboxStore } from "@/lib/inbox-store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

const SURFACE_ID = "inbox-popover-surface";

const MORPH = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
  mass: 0.65,
};

export function InboxHeaderButton() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const sections = useInboxStore((s) => s.sections);
  const open = useUiStore((s) => s.inboxOpen);
  const setInboxOpen = useUiStore((s) => s.setInboxOpen);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tracked = useAnchorBox(true, wrapRef);
  const box = wrapRef.current?.getBoundingClientRect() ?? tracked;
  const count = inboxBadgeCount(sections);
  const label = t("header.inbox");
  const detail = t("inbox.indicator", {
    reviews: sections.reviewRequested.length,
    failures: sections.redRuns.length,
  });
  const transition = reduce ? { duration: 0 } : MORPH;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const node = event.target as Node;
      if (wrapRef.current?.contains(node) || panelRef.current?.contains(node)) return;
      setInboxOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInboxOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setInboxOpen]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const panelStyle = box
    ? {
        top: Math.min(
          box.bottom + 8,
          window.innerHeight - Math.min(window.innerHeight * 0.82, 704) - 12,
        ),
        right: Math.max(12, window.innerWidth - box.right),
        width: Math.min(768, window.innerWidth - 24),
        height: Math.min(window.innerHeight * 0.82, 704),
      }
    : undefined;

  return (
    <LayoutGroup id="inbox-morph">
      <div ref={wrapRef} className="relative shrink-0">
        {open ? (
          <span className="inline-flex size-7" aria-hidden />
        ) : (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <m.button
                type="button"
                layoutId={SURFACE_ID}
                transition={transition}
                aria-label={count > 0 ? `${label}: ${detail}` : label}
                aria-haspopup="dialog"
                aria-expanded={false}
                onClick={() => setInboxOpen(true)}
                whileTap={reduce ? undefined : { scale: 0.92 }}
                className={cn(
                  "relative inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
                  sections.redRuns.length > 0 && "text-[var(--git-removed)]",
                )}
              >
                <Inbox className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                {count > 0 ? (
                  <span
                    className={cn(
                      "absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[0.5625rem] font-semibold tabular-nums leading-none text-white",
                      sections.redRuns.length > 0 ? "bg-[var(--git-removed)]" : "bg-primary",
                    )}
                  >
                    {count > 9 ? "9+" : count}
                  </span>
                ) : null}
              </m.button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <span className="font-medium">{label}</span>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <OverlayPortal>
        {open && panelStyle ? (
          <m.div
            ref={panelRef}
            layoutId={SURFACE_ID}
            transition={transition}
            role="dialog"
            aria-label={label}
            aria-modal="false"
            tabIndex={-1}
            style={{
              position: "fixed",
              zIndex: 80,
              ...panelStyle,
            }}
            className="flex flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10 outline-none"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2 z-10"
              aria-label={t("common.close")}
              onClick={() => setInboxOpen(false)}
            >
              <XIcon />
            </Button>
            <m.div
              className="flex min-h-0 flex-1 flex-col"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduce ? 0 : 0.16, delay: reduce ? 0 : 0.08 }}
            >
              <InboxPopup />
            </m.div>
          </m.div>
        ) : null}
      </OverlayPortal>
    </LayoutGroup>
  );
}
