import { memo } from "react";
import { useTranslation } from "react-i18next";

import { InboxRow } from "@/components/inbox/inbox-row";
import type { AgentOverviewEntry, AgentOverviewStatus } from "@/lib/agents/overview";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<AgentOverviewStatus, string> = {
  running: "text-git-modified",
  awaitingApproval: "text-git-modified",
  failed: "text-git-removed",
  idle: "text-muted-foreground",
};

function agentRelativeTime(updatedAtSeconds: number): string {
  if (!Number.isFinite(updatedAtSeconds) || updatedAtSeconds <= 0) return "";
  return formatRelative(new Date(updatedAtSeconds * 1000).toISOString());
}

export const InboxAgentRow = memo(function InboxAgentRow({
  entry,
  onOpen,
}: {
  entry: AgentOverviewEntry;
  onOpen: (entry: AgentOverviewEntry) => void;
}) {
  const { t } = useTranslation();

  return (
    <InboxRow
      repoName={entry.repoName}
      title={entry.title}
      relativeTime={agentRelativeTime(entry.updatedAt)}
      tooltip={entry.path}
      onOpen={() => onOpen(entry)}
      meta={
        <>
          <span className={cn("shrink-0 font-medium", STATUS_COLOR[entry.status])}>
            {t(`agentOverview.status.${entry.status}`)}
          </span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{entry.provider}</span>
          {entry.branch ? (
            <>
              <span aria-hidden>·</span>
              <span className="max-w-40 truncate">{entry.branch}</span>
            </>
          ) : null}
        </>
      }
      badges={
        entry.pendingRequests > 0 ? (
          <span className="shrink-0 rounded-md bg-git-modified/15 px-1.5 py-0.5 text-[10px] font-medium text-git-modified">
            {t("inbox.badges.pendingRequests", { count: entry.pendingRequests })}
          </span>
        ) : null
      }
    />
  );
});
