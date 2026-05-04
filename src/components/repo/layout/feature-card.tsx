import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FeatureCardProps {
  icon: ReactNode;
  caption: string;
  label: string;
  iconWellClassName?: string;
}

export function FeatureCard({
  icon,
  caption,
  label,
  iconWellClassName = "bg-green-50",
}: FeatureCardProps) {
  return (
    <div
      className={cn(
        "flex flex-row items-center gap-3 rounded-[1.25rem] bg-white p-4 shadow-sm shadow-black/5 ring-1 ring-black/[0.03]",
      )}
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
