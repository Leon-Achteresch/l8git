import { GitBranch } from "lucide-react";

export function CommitBranchBadge({
  name,
  accentColor,
}: {
  name: string;
  accentColor: string;
}) {
  return (
    <span
      className="inline-flex h-6 max-w-[min(100%,14rem)] shrink-0 items-stretch overflow-hidden rounded-md border border-border bg-background text-xs font-medium text-foreground"
      title={name}
    >
      <span
        className="flex w-6 shrink-0 items-center justify-center"
        style={{ backgroundColor: accentColor }}
      >
        <GitBranch className="h-3.5 w-3.5 text-white" />
      </span>
      <span className="flex min-w-0 items-center truncate px-2">{name}</span>
    </span>
  );
}
