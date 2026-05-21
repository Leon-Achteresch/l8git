import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Trend = "up" | "down" | "flat";

export function DashboardStatCard({
  icon: Icon,
  label,
  value,
  delta,
  trend,
  chart,
  footer,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  trend?: Trend;
  chart?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const trendColor =
    trend === "up"
      ? "text-emerald-500"
      : trend === "down"
        ? "text-rose-500"
        : "text-muted-foreground";

  return (
    <Card size="sm" className={cn("relative", className)}>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            {Icon ? (
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
                <Icon className="size-3.5" />
              </span>
            ) : null}
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          </div>
          {delta ? (
            <span
              className={cn(
                "rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium tabular-nums",
                trendColor,
              )}
            >
              {delta}
            </span>
          ) : null}
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="font-heading text-2xl font-semibold leading-none tracking-tight tabular-nums">
            {value}
          </div>
          {chart ? <div className="flex h-10 w-24 items-end">{chart}</div> : null}
        </div>
        {footer ? <div className="text-xs text-muted-foreground">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
