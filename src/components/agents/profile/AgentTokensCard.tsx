import { m, useReducedMotion } from "motion/react";
import { useMemo } from "react";

import { formatCompact, tokensSeries } from "@/components/agents/profile/agent-profile-data";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { easeOutSoft } from "@/components/motion/kit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentOverviewEntry } from "@/lib/agents/overview";

function pathFrom(values: number[], width: number, height: number, pad: number): string {
  if (!values.length) return "";
  const max = Math.max(1, ...values);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = pad + i * step;
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function AgentTokensCard({ entries }: { entries: AgentOverviewEntry[] }) {
  const series = useMemo(() => tokensSeries(entries, 30), [entries]);
  const total = series.reduce((s, v) => s + v, 0);
  const d = useMemo(() => pathFrom(series, 600, 160, 8), [series]);
  const delta = useMemo(() => {
    if (series.length < 2) return "+0.0%";
    const half = Math.floor(series.length / 2);
    const first = series.slice(0, half).reduce((s, v) => s + v, 0);
    const second = series.slice(half).reduce((s, v) => s + v, 0);
    if (first <= 0) return second > 0 ? "+100%" : "+0.0%";
    return `+${(((second - first) / first) * 100).toFixed(1)}%`;
  }, [series]);
  const reduce = useReducedMotion();

  return (
    <m.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOutSoft, delay: 0.25 }}>
      <Card data-testid="agent-tokens-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Tokens</CardTitle>
            <CardDescription>30-day trend · sharp joins, rebuilt with base Card</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tracking-tight tabular-nums">
              <AnimatedNumber value={total} format={(n) => `${formatCompact(n)} tokens`} />
            </div>
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{delta}</div>
          </div>
        </CardHeader>
        <CardContent>
          <svg viewBox="0 0 600 160" className="h-36 w-full" role="img" aria-label="Token trend">
            <defs>
              <linearGradient id="agent-tokens-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            {d ? (
              <>
                <m.path
                  d={`${d} L592,152 L8,152 Z`}
                  fill="url(#agent-tokens-fill)"
                  className="text-emerald-500"
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...easeOutSoft, delay: 0.4 }}
                />
                <m.path
                  d={d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinejoin="miter"
                  strokeLinecap="square"
                  className="text-emerald-500"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                />
              </>
            ) : null}
          </svg>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </CardContent>
      </Card>
    </m.div>
  );
}
