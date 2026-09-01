import { FolderGit2, GitBranch } from "lucide-react";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import { AgentProviderMark } from "@/components/agents/ui/agent-provider-mark";
import { AgentStatusChip } from "@/components/agents/ui/agent-status-chip";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import { formatUsd } from "@/lib/agents/token-cost";
import type { AgentOverviewEntry, AgentOverviewStatus } from "@/lib/agents/overview";
import type { WorktreeDiffStat } from "@/lib/agents/worktree-diff";
import { m, useReducedMotion } from "motion/react";
import { SPRING_PRESS } from "@/lib/motion/ease";

const STATUS_TONE: Record<AgentOverviewStatus, "working" | "waiting" | "error" | "ready"> = {
  running: "working",
  awaitingApproval: "waiting",
  failed: "error",
  idle: "ready",
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
  const reduce = useReducedMotion();
  const providerMeta = agentProviderMeta(entry.provider);
  const ProviderLogo = providerMeta.Logo;
  const statusLabel = t(`agentOverview.status.${entry.status}`);
  const working = entry.status === "running" || entry.status === "awaitingApproval";

  return (
    <m.div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(entry)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(entry);
      }}
      title={entry.path}
      whileTap={reduce ? undefined : { scale: 0.99 }}
      transition={SPRING_PRESS}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      className="ag-row ag-row-shared relative min-h-14 items-start gap-2.5 px-3 py-2.5"
    >
      <AgentProviderMark working={working} label={providerMeta.label} className="relative z-[1] mt-0.5">
        <ProviderLogo />
      </AgentProviderMark>

      <span className="relative z-[1] min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium tracking-[-0.01em]">{entry.title}</span>
          <AgentStatusChip tone={STATUS_TONE[entry.status]} className="shrink-0">
            {statusLabel}
          </AgentStatusChip>
          <span className="ag-faint shrink-0 text-[10px] tabular-nums">{relativeDate}</span>
        </span>

        <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
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
    </m.div>
  );
});
