import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { AGENT_PROVIDERS } from "@/lib/agents/provider-meta";
import type { IslandProviderUsage, IslandUsageWindow } from "@/lib/island/types";
import {
  USAGE_SHORT_NAME,
  usageBarHot,
  usageResetsLabel,
  usageRingColor,
  usageRowKnown,
} from "@/lib/island/usage-format";
import { useIslandStore } from "@/lib/island-store";
import { cn } from "@/lib/utils";

const SIZE = 40;
const RADIUS = 15.5;
const RING = 2 * Math.PI * RADIUS;

export function IslandUsage({
  usage,
  vertical,
  side,
  dragging,
  onOpenActions,
}: {
  usage: IslandProviderUsage[];
  vertical: boolean;
  side: "top" | "right" | "bottom" | "left";
  dragging?: boolean;
  onOpenActions?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef(0);

  const setUsagePopover = useIslandStore((s) => s.setUsagePopover);

  useEffect(() => {
    if (dragging) setOpen(null);
  }, [dragging]);

  useEffect(() => {
    setUsagePopover(!!open && !dragging);
  }, [open, dragging, setUsagePopover]);

  useEffect(() => () => setUsagePopover(false), [setUsagePopover]);

  useEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    const sync = () => {
      const node = rootRef.current?.querySelector(`[data-usage="${open}"]`);
      if (node instanceof HTMLElement) setAnchor(node.getBoundingClientRect());
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [open, usage, vertical]);

  const keep = () => {
    window.clearTimeout(closeTimer.current);
  };
  const delayClose = () => {
    keep();
    closeTimer.current = window.setTimeout(() => setOpen(null), 140);
  };

  const active = usage.find((row) => row.id === open) ?? null;
  const ActiveLogo = AGENT_PROVIDERS.find((entry) => entry.value === active?.id)?.Logo;

  return (
    <>
      <div
        ref={rootRef}
        className={cn(
          vertical ? "flex flex-col items-center gap-2.5" : "flex items-center gap-4",
        )}
        onClick={() => onOpenActions?.()}
      >
        {usage.map((row) => {
          const known = usageRowKnown(row);
          const percent = Math.round(row.primary?.usedPercent ?? row.secondary?.usedPercent ?? 0);
          const Logo = AGENT_PROVIDERS.find((entry) => entry.value === row.id)?.Logo;
          const color = usageRingColor(percent);
          const selected = open === row.id;
          const dash = known ? (Math.min(100, Math.max(0, percent)) / 100) * RING : 0;
          return (
            <button
              key={row.id}
              type="button"
              data-usage={row.id}
              data-no-drag
              aria-label={t("island.usage.title", {
                name: USAGE_SHORT_NAME[row.id] ?? row.id,
              })}
              aria-expanded={selected}
              onClick={(event) => {
                event.stopPropagation();
                setOpen((current) => (current === row.id ? null : row.id));
              }}
              onMouseEnter={() => {
                keep();
                setOpen(row.id);
              }}
              onMouseLeave={delayClose}
              className={cn(
                "flex flex-col items-center gap-1 text-background",
                !known && "opacity-50",
              )}
            >
              <span className="relative inline-flex size-10 items-center justify-center">
                <svg
                  className="absolute inset-0 size-10 -rotate-90"
                  viewBox={`0 0 ${SIZE} ${SIZE}`}
                  aria-hidden
                >
                  <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="opacity-25"
                  />
                  {dash > 0.8 ? (
                    <circle
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      fill="none"
                      stroke={color}
                      strokeWidth="2.75"
                      strokeLinecap="butt"
                      strokeDasharray={`${dash} ${RING}`}
                    />
                  ) : null}
                </svg>
                {Logo ? <Logo className="size-4" /> : null}
              </span>
              <span
                className="text-[10px] font-semibold tabular-nums leading-none tracking-tight opacity-90"
                style={known ? { color } : undefined}
              >
                {known ? `${percent}%` : "—"}
              </span>
            </button>
          );
        })}
      </div>
      {active && anchor && !dragging
        ? createPortal(
            <div
              data-no-drag
              onMouseEnter={keep}
              onMouseLeave={delayClose}
              style={popoverStyle(anchor, side)}
              className="pointer-events-auto fixed z-[80] w-[236px] rounded-[20px] bg-[#2c2c2e] p-3.5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.55)] ring-1 ring-white/12"
            >
              <span
                aria-hidden
                className="absolute size-2.5 rotate-45 bg-[#2c2c2e]"
                style={caretStyle(side)}
              />
              <div className="relative mb-3.5 flex items-center gap-2">
                {ActiveLogo ? <ActiveLogo className="size-4" /> : null}
                <span className="text-[13px] font-semibold tracking-tight">
                  {t("island.usage.title", {
                    name: USAGE_SHORT_NAME[active.id] ?? active.id,
                  })}
                </span>
              </div>
              {active.primary
                ? usageWindowBlock(
                    t("island.usage.session"),
                    active.primary,
                    i18n.language,
                    t,
                  )
                : null}
              {active.secondary
                ? usageWindowBlock(
                    t("island.usage.allModels"),
                    active.secondary,
                    i18n.language,
                    t,
                  )
                : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function usageWindowBlock(
  label: string,
  limit: IslandUsageWindow,
  locale: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  const used = Math.min(100, Math.max(0, limit.usedPercent));
  const hot = usageBarHot(used);
  const resets = usageResetsLabel(
    limit,
    Date.now(),
    (timestamp) =>
      t("island.usage.resetsAt", {
        value: new Intl.DateTimeFormat(locale, {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        }).format(timestamp),
      }),
    (mins) => t("island.usage.resetsIn", { count: mins }),
  );
  return (
    <div key={label} className="relative mb-3.5 last:mb-0">
      <div className="mb-2 flex items-baseline justify-between gap-2 text-[11px] leading-none">
        <span className="font-medium text-white/90">{label}</span>
        {resets ? <span className="shrink-0 text-white/45">{resets}</span> : null}
      </div>
      <span className="block h-2 overflow-hidden rounded-full bg-white/20">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.max(used, 0)}%`,
            background: hot
              ? "linear-gradient(90deg, #f59e0b, #ef4444)"
              : "linear-gradient(90deg, #4ade80, #16a34a)",
          }}
        />
      </span>
      <span className="mt-1.5 block text-[11px] font-medium tabular-nums text-white/90">
        {t("island.usage.used", { value: `${Math.round(used)}%` })}
      </span>
    </div>
  );
}

function popoverStyle(
  rect: DOMRect,
  side: "top" | "right" | "bottom" | "left",
): CSSProperties {
  const gap = 16;
  switch (side) {
    case "left":
      return {
        top: rect.top + rect.height / 2,
        left: rect.left - gap,
        transform: "translate(-100%, -50%)",
      };
    case "right":
      return {
        top: rect.top + rect.height / 2,
        left: rect.right + gap,
        transform: "translate(0, -50%)",
      };
    case "top":
      return {
        left: rect.left + rect.width / 2,
        top: rect.top - gap,
        transform: "translate(-50%, -100%)",
      };
    case "bottom":
      return {
        left: rect.left + rect.width / 2,
        top: rect.bottom + gap,
        transform: "translate(-50%, 0)",
      };
    default: {
      const _exhaustive: never = side;
      return _exhaustive;
    }
  }
}

function caretStyle(side: "top" | "right" | "bottom" | "left"): CSSProperties {
  switch (side) {
    case "left":
      return { top: "50%", right: "-5px", marginTop: "-5px" };
    case "right":
      return { top: "50%", left: "-5px", marginTop: "-5px" };
    case "top":
      return { left: "50%", bottom: "-5px", marginLeft: "-5px" };
    case "bottom":
      return { left: "50%", top: "-5px", marginLeft: "-5px" };
    default: {
      const _exhaustive: never = side;
      return _exhaustive;
    }
  }
}
