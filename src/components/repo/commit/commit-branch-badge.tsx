import { memo } from "react";
import { PopIn } from "@/components/motion/pop-in";
import { cn } from "@/lib/utils";

function CommitBranchBadgeInner({
  name,
  accentColor,
  tone = "soft",
}: {
  name: string;
  accentColor: string;
  tone?: "dark" | "soft" | "blue" | "rose";
}) {
  const shell = cn(
    "max-w-[14rem] shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
    tone === "dark" &&
      "border border-slate-200/90 bg-slate-100 text-slate-900 dark:border-zinc-600/80 dark:bg-zinc-800 dark:text-zinc-100",
    tone === "soft" && "border border-border/70 bg-background text-foreground/90",
    tone === "blue" &&
      "border border-blue-200/80 bg-blue-100 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/60 dark:text-blue-100",
    tone === "rose" &&
      "border border-rose-200/80 bg-rose-100 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/60 dark:text-rose-100",
  );
  return (
    <PopIn title={name} className={shell}>
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: accentColor }}
        aria-hidden="true"
      />
      <span className="min-w-0 truncate">{name}</span>
    </PopIn>
  );
}

export const CommitBranchBadge = memo(CommitBranchBadgeInner);
