import { Ticket } from "lucide-react";

import type { JiraTicketLink } from "@/lib/jira/types";

function statusTone(link: JiraTicketLink): string {
  const category = link.statusCategory.toLowerCase();
  if (category.includes("done") || category.includes("complete")) return "text-[var(--git-added)]";
  if (category.includes("progress")) return "text-[var(--git-modified)]";
  return "text-[var(--ag-text-3)]";
}

export function AgentThreadJiraBadge({ links }: { links: JiraTicketLink[] }) {
  const [first, ...rest] = links;
  if (!first) return null;
  const title = [first.summary ? `${first.key}: ${first.summary}` : first.key, first.status]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className="ml-auto flex min-w-0 shrink items-center gap-1 pl-1.5"
      title={rest.length ? `${title} (+${rest.length})` : title}
    >
      <Ticket className="size-2.5 shrink-0 text-[var(--ag-text-3)]" />
      <span className="truncate text-[10px] font-medium text-[var(--ag-text-2)]">{first.key}</span>
      {first.status ? (
        <span className={`truncate text-[10px] ${statusTone(first)}`}>{first.status}</span>
      ) : null}
      {rest.length ? <span className="ag-faint text-[10px]">+{rest.length}</span> : null}
    </span>
  );
}
