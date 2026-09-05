import { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FeatureCardProps {
  icon: ReactNode;
  caption: string;
  label: string;
  iconWellClassName?: string;
  floatingPhase?: number;
}

export function FeatureCard({
  icon,
  caption,
  label,
  iconWellClassName = "bg-git-added",
  floatingPhase = 0,
}: FeatureCardProps) {
  const baseDuration = 18;
  const duration = baseDuration + (floatingPhase % 4) * 1.35;

  return (
    <div
      aria-hidden
      className={cn(
        "feature-card-float flex flex-row items-center gap-3 rounded-2xl bg-card p-4 shadow-xs ring-1 ring-border/50",
      )}
      style={
        {
          animationDuration: `${duration}s`,
          animationDelay: `${floatingPhase * -4.5}s`,
        } as CSSProperties
      }
    >
      <div
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-xl",
          iconWellClassName,
        )}
      >
        {icon}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-muted-foreground">{caption}</span>
        <span className="text-lg font-semibold tracking-tight text-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}
