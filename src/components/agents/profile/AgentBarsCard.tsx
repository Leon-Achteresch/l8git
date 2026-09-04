import { ChevronLeft, ChevronRight } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

import { monthBuckets, monthLabel } from "@/components/agents/profile/agent-profile-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { easeOutSoft } from "@/components/motion/kit";
import type { AgentOverviewEntry } from "@/lib/agents/overview";
import { cn } from "@/lib/utils";

export function AgentBarsCard({ entries }: { entries: AgentOverviewEntry[] }) {
  const now = new Date();
  const [offset, setOffset] = useState(0);
  const base = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const buckets = useMemo(
    () => monthBuckets(entries, base.getFullYear(), base.getMonth()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, base.getFullYear(), base.getMonth()],
  );
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const reduce = useReducedMotion();

  return (
    <m.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOutSoft, delay: 0.2 }}>
      <Card data-testid="agent-bars-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Agents</CardTitle>
            <CardDescription>
              {total} agents · {monthLabel(base.getFullYear(), base.getMonth())} · idle days collapse to grey stubs
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setOffset((o) => o + 1)}>
              <ChevronLeft />
            </Button>
            <span className="min-w-20 text-center text-xs font-medium tabular-nums">
              {base.toLocaleDateString(undefined, { month: "long" })}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next month"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex h-36 items-end gap-[3px]" role="img" aria-label={`${total} agent runs in month`}>
            {buckets.map((b, i) => {
              const active = b.count > 0;
              const height = active ? Math.max(12, Math.round((b.count / max) * 100)) : 8;
              return (
                <Tooltip key={b.key} delayDuration={150}>
                  <TooltipTrigger asChild>
                    <m.div
                      initial={reduce ? false : { scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ ...easeOutSoft, delay: Math.min(i, 31) * 0.015 }}
                      style={{ height: `${height}%` }}
                      className={cn(
                        "flex-1 origin-bottom rounded-[3px]",
                        active
                          ? "bg-orange-500/90 hover:bg-orange-500 dark:bg-orange-400/90 dark:hover:bg-orange-400"
                          : "bg-muted-foreground/25",
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {b.label} · {b.count} runs
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground tabular-nums">
            <span>1</span>
            <span>{buckets.length}</span>
          </div>
        </CardContent>
      </Card>
    </m.div>
  );
}
