import { m, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { CapabilityCliMark } from "@/components/agents/capabilities/capability-cli-mark";
import {
  itemStatusForTarget,
  type CapabilityItem,
  type CapabilityItemStatus,
  type CapabilityTargetInfo,
  type CapabilityTargetRef,
} from "@/lib/agents/capability-hub";
import { SPRING_PRESS } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

const TONE: Record<CapabilityItemStatus, string> = {
  missing: "border-emerald-500/40 bg-transparent text-[var(--ag-text-2)]",
  different: "border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  same: "border-[var(--ag-line-strong)] bg-[var(--ag-surface-2)] text-[var(--ag-text)]",
  unsupported: "border-transparent bg-transparent text-[var(--ag-text-3)] opacity-35",
};

export function CapabilityPresence({
  item,
  columns,
  infos,
  items,
  sourceCli,
  onPick,
}: {
  item: CapabilityItem;
  columns: CapabilityTargetRef[];
  infos: CapabilityTargetInfo[];
  items: CapabilityItem[];
  sourceCli?: string;
  onPick?: (target: CapabilityTargetRef, status: CapabilityItemStatus) => void;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  return (
    <span className="flex flex-wrap items-center gap-1">
      {columns.map((column) => {
        const status = itemStatusForTarget(item, column, infos, items);
        const info = infos.find((entry) => entry.cli === column.cli);
        const isSource = column.cli === sourceCli;
        const actionable = Boolean(onPick) && (status === "missing" || status === "different") && !isSource;
        return (
          <m.button
            key={`${column.cli}:${column.scope}`}
            type="button"
            disabled={!actionable}
            title={`${info?.label ?? column.cli}: ${t(`agentCapabilities.hub.presence.${status}`)}`}
            aria-label={`${info?.label ?? column.cli}: ${t(`agentCapabilities.hub.presence.${status}`)}`}
            onClick={() => onPick?.(column, status)}
            whileTap={reduce || !actionable ? undefined : { scale: 0.9 }}
            transition={SPRING_PRESS}
            className={cn(
              "grid size-6 place-items-center rounded-[7px] border",
              TONE[status],
              isSource && "ring-2 ring-[var(--ag-text)]/20 ring-offset-1 ring-offset-[var(--ag-surface)]",
              actionable && "hover:scale-105",
              !actionable && "cursor-default",
            )}
          >
            <CapabilityCliMark cli={column.cli} logoClassName="size-3" />
          </m.button>
        );
      })}
    </span>
  );
}
