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
} from "@/lib/island/usage-format";
import { cn } from "@/lib/utils";

const RING = 2 * Math.PI * 13;

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

  useEffect(() => {
    if (dragging) setOpen(null);
  }, [dragging]);

  useEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    const node = rootRef.current?.querySelector(`[data-usage="${open}"]`);
    if (node instanceof HTMLElement) setAnchor(node.getBoundingClientRect());
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
        className={cn(vertical ? "flex flex-col items-center gap-2" : "flex items-center gap-3")}
        onClick={() => onOpenActions?.()}
      >
        {usage.map((row) => {
          const percent = Math.round(row.primary?.usedPercent ?? row.secondary?.usedPercent ?? 0);
          const Logo = AGENT_PROVIDERS.find((entry) => entry.value === row.id)?.Logo;
          const color = usageRingColor(percent);
          const selected = open === row.id;
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
              className="flex flex-col items-center gap-0.5 text-background"
            >
              <span className="relative inline-flex size-8 items-center justify-center">
                <svg className="absolute inset-0 size-8 -rotate-90" viewBox="0 0 32 32" aria-hidden>
                  <circle
                    cx="16"
                    cy="16"
                    r="13"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="opacity-20"
                  />
                  <circle
                    cx="16"
                    cy="16"
                    r="13"
                    fill="none"
                    stroke={color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={`${(Math.min(100, Math.max(0, percent)) / 100) * RING} ${RING}`}
                  />
                </svg>
                {Logo ? <Logo className="size-3.5" /> : null}
              </span>
              <span className="text-[9px] font-semibold tabular-nums leading-none opacity-90">
                {percent}%
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
              className="pointer-events-auto fixed z-[80] w-[220px] rounded-[18px] bg-foreground p-3 text-background shadow-2xl"
            >
              <div className="mb-3 flex items-center gap-2">
                {ActiveLogo ? <ActiveLogo className="size-4" /> : null}
                <span className="text-[13px] font-semibold">
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
    <div key={label} className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="font-medium">{label}</span>
        {resets ? <span className="shrink-0 opacity-55">{resets}</span> : null}
      </div>
      <span className="block h-1.5 overflow-hidden rounded-full bg-background/15">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${used}%`,
            background: hot
              ? "linear-gradient(90deg, #f59e0b, #ef4444)"
              : "linear-gradient(90deg, #4ade80, #22c55e)",
          }}
        />
      </span>
      <span className="mt-1 block text-[11px] font-medium tabular-nums">
        {t("island.usage.used", { value: Math.round(used) })}
      </span>
    </div>
  );
}

function popoverStyle(
  rect: DOMRect,
  side: "top" | "right" | "bottom" | "left",
): CSSProperties {
  const gap = 12;
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
