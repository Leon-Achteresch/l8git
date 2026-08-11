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
    tone === "dark" && "border border-border bg-secondary text-secondary-foreground",
    tone === "soft" && "border border-border/70 bg-background text-foreground/90",
    tone === "blue" &&
      "border border-git-branch/30 bg-git-branch/15 text-git-branch",
    tone === "rose" &&
      "border border-git-removed/30 bg-git-removed/15 text-git-removed",
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
