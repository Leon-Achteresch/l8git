import { memo } from "react";
import { PopIn } from "@/components/motion/pop-in";

function CommitBranchBadgeInner({
  name,
  accentColor,
}: {
  name: string;
  accentColor: string;
}) {
  return (
    <PopIn
      title={name}
      className="max-w-[14rem] shrink-0 items-center gap-1.5 rounded-sm border border-border/80 bg-background px-2 py-0.5 text-xs font-medium text-foreground/90"
    >
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
