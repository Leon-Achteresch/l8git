import { ChevronLeft, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ISLAND_ICON } from "@/components/island/island-ui";
import { Button } from "@/components/ui/button";
import { AGENT_PROVIDERS } from "@/lib/agents/provider-meta";
import type { IslandProviderUsage, IslandUsageWindow } from "@/lib/island/types";
import {
  USAGE_SHORT_NAME,
  usageBarHot,
  usageResetsLabel,
  usageRingColor,
  usageRowKnown,
} from "@/lib/island/usage-format";
import { cn } from "@/lib/utils";

const SIZE = 40;
const RADIUS = 15.5;
const RING = 2 * Math.PI * RADIUS;

function logoOf(id: string) {
  return AGENT_PROVIDERS.find((entry) => entry.value === id)?.Logo;
}

export function IslandUsage({
  usage,
  vertical,
  onOpenActions,
  onSelect,
}: {
  usage: IslandProviderUsage[];
  vertical: boolean;
  onOpenActions?: () => void;
  onSelect?: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={vertical ? "flex flex-col items-center gap-2.5" : "flex items-center gap-4"}
      onClick={() => onOpenActions?.()}
    >
      {usage.map((row) => {
        const known = usageRowKnown(row);
        const percent = Math.round(row.primary?.usedPercent ?? row.secondary?.usedPercent ?? 0);
        const Logo = logoOf(row.id);
        const color = usageRingColor(percent);
        const dash = known ? (Math.min(100, Math.max(0, percent)) / 100) * RING : 0;
        return (
          <button
            key={row.id}
            type="button"
            data-no-drag
            aria-label={t("island.usage.title", { name: USAGE_SHORT_NAME[row.id] ?? row.id })}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(row.id);
            }}
            className={cn("flex flex-col items-center gap-1 text-background", !known && "opacity-50")}
          >
            <span className="relative inline-flex size-10 items-center justify-center">
              <svg className="absolute inset-0 size-10 -rotate-90" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
                <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="currentColor" strokeWidth="2" className="opacity-25" />
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
  );
}

export function IslandUsageDetails({
  row,
  onBack,
  onClose,
}: {
  row: IslandProviderUsage;
  onBack: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const Logo = logoOf(row.id);
  return (
    <div className="flex w-[260px] flex-col">
      <div className="flex items-center gap-1 pb-2">
        <Button variant="ghost" size="icon-xs" onClick={onBack} aria-label={t("common.back")} className={ISLAND_ICON}>
          <ChevronLeft />
        </Button>
        {Logo ? <Logo className="size-4" /> : null}
        <span className="flex-1 truncate text-xs font-medium">
          {t("island.usage.title", { name: USAGE_SHORT_NAME[row.id] ?? row.id })}
        </span>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label={t("island.close")} className={ISLAND_ICON}>
          <X />
        </Button>
      </div>
      {row.primary ? usageWindowBlock(t("island.usage.session"), row.primary, i18n.language, t) : null}
      {row.secondary ? usageWindowBlock(t("island.usage.allModels"), row.secondary, i18n.language, t) : null}
      {!row.primary && !row.secondary ? (
        <p className="px-1 py-2 text-center text-[11px] opacity-50">{t("island.usage.unknown")}</p>
      ) : null}
    </div>
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
        value: new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(timestamp),
      }),
    (mins) => t("island.usage.resetsIn", { count: mins }),
  );
  return (
    <div key={label} className="px-1 pb-3 last:pb-1">
      <div className="mb-2 flex items-baseline justify-between gap-2 text-[11px] leading-none">
        <span className="font-medium opacity-90">{label}</span>
        {resets ? <span className="shrink-0 opacity-45">{resets}</span> : null}
      </div>
      <span className="block h-2 overflow-hidden rounded-full bg-background/20">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${used}%`,
            background: hot
              ? "linear-gradient(90deg, #f59e0b, #ef4444)"
              : "linear-gradient(90deg, #4ade80, #16a34a)",
          }}
        />
      </span>
      <span className="mt-1.5 block text-[11px] font-medium tabular-nums opacity-90">
        {t("island.usage.used", { value: `${Math.round(used)}%` })}
      </span>
    </div>
  );
}
