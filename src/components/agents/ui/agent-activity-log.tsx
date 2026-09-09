import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AgentActivityEntry = {
  id: string;
  label: ReactNode;
  chip?: { label: string; icon?: ReactNode };
};

export type AgentActivityGroup = {
  id: string;
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  entries: AgentActivityEntry[];
};

export function AgentActivityLog({ groups, className }: { groups: AgentActivityGroup[]; className?: string }) {
  return (
    <div className={cn("flex w-full flex-col gap-3 text-sm", className)}>
      {groups.map(group => (
        <details key={group.id} open={group.defaultOpen ?? true} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground marker:hidden">
            {group.icon ? <span className="shrink-0 [&_svg]:size-3.5">{group.icon}</span> : null}
            <span className="min-w-0 truncate text-foreground">{group.title}</span>
            <ChevronDown
              className="ml-auto size-3.5 shrink-0 transition-transform duration-150 group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <ul className="mt-1 flex flex-col">
            {group.entries.map(entry => (
              <li key={entry.id} className="relative flex min-h-7 items-center gap-2 pl-6 text-muted-foreground">
                <span
                  className="absolute left-1.5 top-0 h-full w-3 border-l border-border last:h-1/2 [li:last-child_&]:h-1/2"
                  aria-hidden
                />
                <span className="absolute left-1.5 top-1/2 w-3 border-t border-border" aria-hidden />
                <span className="min-w-0 truncate">{entry.label}</span>
                {entry.chip ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-foreground [&_svg]:size-3">
                    {entry.chip.icon}
                    {entry.chip.label}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
