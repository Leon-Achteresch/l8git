import { FolderGit2, GitBranch } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import { AgentProviderMark } from "@/components/agents/ui/agent-provider-mark";
import { AgentStatusChip } from "@/components/agents/ui/agent-status-chip";
import type {
  AgentOverviewEntry,
  AgentOverviewStatus,
} from "@/lib/agents/overview";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import { formatUsd } from "@/lib/agents/token-cost";
import type { WorktreeDiffStat } from "@/lib/agents/worktree-diff";
import { SPRING_PRESS } from "@/lib/motion/ease";

const STATUS_TONE: Record<
  AgentOverviewStatus,
  "working" | "waiting" | "error" | "ready"
> = {
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
  const working =
    entry.status === "running" || entry.status === "awaitingApproval";

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
      initial={reduce ? false : { opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      className="relative flex min-h-16 w-full min-w-0 items-start gap-3 rounded-[var(--ag-r-md)] border border-transparent px-3.5 py-3 text-left text-[var(--ag-text-2)] outline-none transition-[background-color,border-color,color,transform,box-shadow] duration-200 hover:border-[var(--ag-line)] hover:bg-[var(--ag-surface)] hover:text-[var(--ag-text)] hover:shadow-[var(--ag-shadow-raise)] active:bg-[var(--ag-press)] focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-[var(--ag-surface)] data-[active=true]:text-[var(--ag-text)] data-[active=true]:shadow-[var(--ag-shadow-raise)]"
    >
      <AgentProviderMark
        working={working}
        label={providerMeta.label}
        className="relative z-[1] mt-0.5"
      >
        <ProviderLogo />
      </AgentProviderMark>

      <span className="relative z-[1] min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-32 flex-1 truncate text-[13px] font-semibold tracking-[-0.015em] text-[var(--ag-text)]">
            {entry.title}
          </span>
          <AgentStatusChip tone={STATUS_TONE[entry.status]} className="shrink-0">
            {statusLabel}
          </AgentStatusChip>
          <span className="text-[var(--ag-text-3)] shrink-0 text-[10px] tabular-nums">
            {relativeDate}
          </span>
        </span>

        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[var(--ag-text-3)] min-w-0 max-w-48 truncate text-[11px] font-medium">
            {entry.repoName}
          </span>
          {entry.isWorktree ? (
            <span
              className="inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[12px] text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform] duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 h-4.5 shrink-0 gap-1 rounded-full px-1.5 text-[9px] font-medium"
              title={entry.branch ?? undefined}
            >
              <FolderGit2 className="size-2.5 shrink-0 text-[var(--git-branch)]" />
              <GitBranch className="size-2.5 shrink-0" />
              <span className="max-w-28 truncate">
                {entry.branch ?? t("agentOverview.worktree")}
              </span>
            </span>
          ) : null}
          {diffStat && diffStat.files > 0 ? (
            <span
              className="shrink-0 text-[10px] font-medium tabular-nums"
              title={t("agentOverview.diffStatHint")}
            >
              <span className="text-[var(--ag-text-3)]">
                {t("agentOverview.files", { count: diffStat.files })}
              </span>{" "}
              <span className="text-[var(--git-added)]">
                +{diffStat.additions}
              </span>{" "}
              <span className="text-[var(--git-removed)]">
                −{diffStat.deletions}
              </span>
            </span>
          ) : null}
          {entry.costUsd ? (
            <span className="text-[var(--ag-text-3)] shrink-0 text-[10px] tabular-nums">
              · {formatUsd(entry.costUsd)}
            </span>
          ) : null}
        </span>

        {entry.preview ? (
          <span className="text-[var(--ag-text-3)] mt-1 line-clamp-1 block text-[11px] leading-4 text-[var(--ag-text-3)]">
            {entry.preview}
          </span>
        ) : null}
      </span>
    </m.div>
  );
});
