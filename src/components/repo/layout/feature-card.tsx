import { motion } from "motion/react";
import { ReactNode, useMemo } from "react";
import { cn } from "@/lib/utils";

function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nextRand(seedRef: { n: number }): number {
  let s = seedRef.n;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  seedRef.n = s >>> 0;
  return (seedRef.n & 0xfffffff) / 0xfffffff;
}

function buildXYPath(seed: number, waypointCount: number, spreadPx: number) {
  const ref = { n: seed };
  const xs: number[] = [0];
  const ys: number[] = [0];
  for (let i = 0; i < waypointCount; i++) {
    xs.push((nextRand(ref) - 0.5) * spreadPx * 2);
    ys.push((nextRand(ref) - 0.5) * spreadPx * 2);
  }
  xs.push(0);
  ys.push(0);
  return { xs, ys };
}

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
  iconWellClassName = "bg-green-50",
  floatingPhase = 0,
}: FeatureCardProps) {
  const baseDuration = 18;
  const duration = baseDuration + (floatingPhase % 4) * 1.35;

  const { xs, ys } = useMemo(() => {
    const seed =
      seedFrom(`${caption}\0${label}\0${floatingPhase}`) ^
      floatingPhase * 2654435761;
    return buildXYPath(seed, 5, 5);
  }, [caption, label, floatingPhase]);

  return (
    <motion.div
      className={cn(
        "flex flex-row items-center gap-3 rounded-[1.25rem] bg-white p-4 shadow-sm shadow-black/5 ring-1 ring-black/[0.03]",
      )}
      animate={{
        x: xs,
        y: ys,
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: [0.45, 0, 0.55, 1],
        delay: floatingPhase * 0.85,
      }}
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
    </motion.div>
  );
}
