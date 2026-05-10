import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

export function RepoWorkspaceSwitch() {
  return (
    <Link
      to="/settings"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card py-1 pl-1.5 pr-2 transition-colors hover:border-border/80"
    >
      <span className="grid size-[22px] shrink-0 grid-cols-2 grid-rows-2 gap-0.5 place-content-center p-0.5">
        <span className="size-[5px] rounded-[1px] bg-muted-foreground/70" />
        <span className="size-[5px] rounded-[1px] bg-muted-foreground/70" />
        <span className="size-[5px] rounded-[1px] bg-muted-foreground/70" />
        <span className="size-[5px] rounded-[1px] bg-muted-foreground/70" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground">
          WORKSPACE
        </span>
        <span className="text-xs font-semibold text-foreground">Persönlich</span>
      </span>
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
