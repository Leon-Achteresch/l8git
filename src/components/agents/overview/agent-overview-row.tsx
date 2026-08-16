import { FolderGit2, GitBranch } from "lucide-react";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import { agentProviderMeta } from "@/lib/agents/provider-meta";
import { formatUsd } from "@/lib/agents/token-cost";
import type { AgentOverviewEntry, AgentOverviewStatus } from "@/lib/agents/overview";
import type { WorktreeDiffStat } from "@/lib/agents/worktree-diff";

const STATUS_DOT: Record<AgentOverviewStatus, string> = {
  running: "working",
  awaitingApproval: "working",
  failed: "error",
  idle: "ready",
};

const STATUS_COLOR: Record<AgentOverviewStatus, string> = {
  running: "text-[var(--git-modified)]",
  awaitingApproval: "text-[var(--git-modified)]",
  failed: "text-[var(--git-removed)]",
  idle: "ag-faint",
};

export const AgentOverviewRow = memo(function AgentOverviewRow({
  entry,
  diffStat,
  relativeDate,
  onOpen,
}: {
  entry: AgentOverviewEntry;
  diffStat?: WorktreeDiffStat;
  relativeDate: string;
  onOpen: (entry: AgentOverviewEntry) => void;
}) {
  const { t } = useTranslation();
  const providerMeta = agentProviderMeta(entry.provider);
  const ProviderLogo = providerMeta.Logo;
  const statusLabel = t(`agentOverview.status.${entry.status}`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(entry)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(entry);
      }}
      title={entry.path}
      className="ag-row min-h-14 items-start gap-2.5 px-3 py-2.5"
    >
      <span
        className="mt-0.5 grid size-4 shrink-0 place-items-center"
        title={providerMeta.label}
        aria-label={providerMeta.label}
      >
        <ProviderLogo className="size-3.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{entry.title}</span>
          <span className="ag-faint shrink-0 text-[10px] tabular-nums">{relativeDate}</span>
        </span>

        <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <span className="ag-dot shrink-0" data-state={STATUS_DOT[entry.status]} aria-hidden="true" />
          <span className={`shrink-0 text-[10px] font-medium ${STATUS_COLOR[entry.status]}`}>
            {statusLabel}
          </span>
          <span className="ag-faint text-[10px]">·</span>
          <span className="ag-faint min-w-0 max-w-40 truncate text-[10px]">{entry.repoName}</span>
          {entry.isWorktree ? (
            <span
              className="ag-chip h-4 shrink-0 gap-1 px-1 text-[9px]"
              title={entry.branch ?? undefined}
            >
              <FolderGit2 className="size-2.5 shrink-0" />
              <GitBranch className="size-2.5 shrink-0" />
              <span className="max-w-28 truncate">{entry.branch ?? t("agentOverview.worktree")}</span>
            </span>
          ) : null}
          {diffStat && diffStat.files > 0 ? (
            <span className="shrink-0 text-[10px] tabular-nums" title={t("agentOverview.diffStatHint")}>
              <span className="ag-faint">{t("agentOverview.files", { count: diffStat.files })}</span>{" "}
              <span className="text-[var(--git-added)]">+{diffStat.additions}</span>{" "}
              <span className="text-[var(--git-removed)]">−{diffStat.deletions}</span>
            </span>
          ) : null}
          {entry.costUsd ? (
            <span className="ag-faint shrink-0 text-[10px] tabular-nums">
              · {formatUsd(entry.costUsd)}
            </span>
          ) : null}
        </span>

        {entry.preview ? (
          <span className="ag-faint mt-1 line-clamp-1 block text-[11px] leading-4">
            {entry.preview}
          </span>
        ) : null}
      </span>
    </div>
  );
});
