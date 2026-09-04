import { m, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

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
  const [range, setRange] = useState<Range>("yearly");
  const reduce = useReducedMotion();
  const columns = useMemo(() => buildHeatmap(entries, RANGE_WEEKS[range]), [entries, range]);
  const total = useMemo(() => entries.length, [entries]);

  return (
    <m.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOutSoft, delay: 0.15 }}>
      <Card data-testid="agent-activity-heatmap">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Activity</CardTitle>
            <CardDescription>
              {total} contributions · GitHub-style heatmap rebuilt from base Card + Tooltip
            </CardDescription>
          </div>
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList aria-label="Activity range">
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="yearly">Yearly</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-1" role="img" aria-label={`${total} contributions in range ${range}`}>
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
                        {cell.count} contributions · {cell.dateLabel}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
            Less
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={cn("size-[11px] rounded-[3px]", LEVEL_CLASS[l])} />
            ))}
            More
          </div>
        </CardContent>
      </Card>
    </m.div>
  );
}
