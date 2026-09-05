import { m, useReducedMotion } from "motion/react";
import type { TFunction } from "i18next";

import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { easeOutSoft } from "@/components/motion/kit";
import { formatCompact } from "@/components/agents/profile/agent-profile-data";
import { formatUsd } from "@/lib/agents/token-cost";

export interface StatTile {
  label: string;
  value: string;
  numeric?: number;
  format?: (n: number) => string;
  delta?: string;
  deltaTone?: "up" | "flat";
}

export function AgentStatTiles({ tiles }: { tiles: StatTile[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="agent-stat-tiles">
      {tiles.map((tile, i) => (
        <m.div
          key={tile.label}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeOutSoft, delay: 0.05 + i * 0.05 }}
        >
          <Card size="sm" className="transition-colors hover:border-foreground/20">
            <CardContent className="flex flex-col gap-1 pt-1">
              <span className="text-xs font-medium text-muted-foreground">{tile.label}</span>
              <span className="text-xl font-semibold tracking-tight tabular-nums">
                {tile.numeric !== undefined ? (
                  <AnimatedNumber value={tile.numeric} format={tile.format ?? ((n) => formatCompact(n))} />
                ) : (
                  tile.value
                )}
              </span>
              {tile.delta ? (
                <span
                  className={
                    tile.deltaTone === "up"
                      ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                      : "text-xs font-medium text-muted-foreground"
                  }
                >
                  {tile.delta}
                </span>
              ) : null}
            </CardContent>
          </Card>
        </m.div>
      ))}
    </div>
  );
}

export function buildContributionTiles(input: {
  totalCost: number;
  lifetimeTokens: number;
  peakTokens: number;
  sessions: number;
  streakDays: number;
}, t: TFunction): StatTile[] {
  return [
    {
      label: t("agentProfile.recordedCost"),
      value: formatUsd(input.totalCost),
      numeric: input.totalCost,
      format: (n) => formatUsd(n),
    },
    {
      label: t("agentProfile.recordedTokens"),
      value: formatCompact(input.lifetimeTokens),
      numeric: input.lifetimeTokens,
      delta: t("agentProfile.peak", { value: formatCompact(input.peakTokens) }),
      deltaTone: "flat",
    },
    {
      label: t("agentProfile.sessions"),
      value: formatCompact(input.sessions),
      numeric: input.sessions,
    },
    {
      label: t("agentProfile.topStreak"),
      value: t("agentProfile.days", { count: input.streakDays }),
      numeric: input.streakDays,
      format: (n) => t("agentProfile.days", { count: Math.round(n) }),
    },
  ];
}
