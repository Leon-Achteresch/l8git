import { m, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { buildHeatmap } from "@/components/agents/profile/agent-profile-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { easeOutSoft } from "@/components/motion/kit";
import type { AgentOverviewEntry } from "@/lib/agents/overview";
import { cn } from "@/lib/utils";

type Range = "weekly" | "monthly" | "yearly";

const RANGE_WEEKS: Record<Range, number> = { weekly: 12, monthly: 26, yearly: 52 };

const LEVEL_CLASS: Record<number, string> = {
  0: "bg-muted",
  1: "bg-emerald-500/30 dark:bg-emerald-400/25",
  2: "bg-emerald-500/55 dark:bg-emerald-400/50",
  3: "bg-emerald-500/80 dark:bg-emerald-400/75",
  4: "bg-emerald-600 dark:bg-emerald-400",
};

export function AgentActivityHeatmap({ entries }: { entries: AgentOverviewEntry[] }) {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<Range>("yearly");
  const reduce = useReducedMotion();
  const columns = useMemo(() => buildHeatmap(entries, RANGE_WEEKS[range]), [entries, range]);
  const total = useMemo(() => columns.flat().reduce((sum, cell) => sum + cell.count, 0), [columns]);

  return (
    <m.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOutSoft, delay: 0.15 }}>
      <Card data-testid="agent-activity-heatmap">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{t("agentWorkspace.activity")}</CardTitle>
            <CardDescription>
              {t("agentProfile.sessionsInRange", { count: total, weeks: RANGE_WEEKS[range] })}
            </CardDescription>
          </div>
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList aria-label={t("agentProfile.activityRange")}>
              <TabsTrigger value="weekly">{t("agentProfile.weeks", { count: 12 })}</TabsTrigger>
              <TabsTrigger value="monthly">{t("agentProfile.weeks", { count: 26 })}</TabsTrigger>
              <TabsTrigger value="yearly">{t("agentProfile.weeks", { count: 52 })}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-1" role="img" aria-label={t("agentProfile.sessionsInRange", { count: total, weeks: RANGE_WEEKS[range] })}>
            <div className="flex min-w-max gap-[3px]">
              {columns.map((col, ci) => (
                <div key={ci} className="flex flex-col gap-[3px]">
                  {col.map((cell, di) => (
                    <Tooltip key={cell.key} delayDuration={150}>
                      <TooltipTrigger asChild>
                        <m.span
                          initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ ...easeOutSoft, delay: Math.min(ci * 7 + di, 80) * 0.004 }}
                          className={cn("size-[11px] rounded-[3px]", LEVEL_CLASS[cell.level])}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {t("agentWorkspace.threadCount", { count: cell.count })} · {new Date(`${cell.key}T00:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" })}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
            {t("agentProfile.less")}
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={cn("size-[11px] rounded-[3px]", LEVEL_CLASS[l])} />
            ))}
            {t("agentProfile.more")}
          </div>
        </CardContent>
      </Card>
    </m.div>
  );
}
