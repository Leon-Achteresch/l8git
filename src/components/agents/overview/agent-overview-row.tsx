import { ArrowUpRight, FolderGit2, GitBranch } from "lucide-react";
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
import { cn } from "@/lib/utils";

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
  const attention =
    entry.status === "awaitingApproval" || entry.status === "failed";

  return (
    <m.button
      type="button"
      onClick={() => onOpen(entry)}
      data-agent-overview-row=""
      data-status={entry.status}
      data-provider={entry.provider}
      title={entry.path}
      whileTap={reduce ? undefined : { scale: 0.99 }}
      transition={SPRING_PRESS}
      className={cn(
        "group relative flex min-h-20 w-full min-w-0 items-start gap-3 rounded-[var(--ag-r-md)] border border-transparent bg-[var(--ag-rail-bg)] px-3 py-3 text-left text-[var(--ag-text-2)] outline-none transition-colors duration-150 hover:border-[var(--ag-line-strong)] hover:bg-[var(--ag-surface)] hover:text-[var(--ag-text)] active:bg-[var(--ag-press)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4",
        attention && "border-[var(--ag-line)] bg-[var(--ag-surface)]",
      )}
    >
      {entry.status !== "idle" ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-2 left-1 w-0.5 rounded-full",
            entry.status === "awaitingApproval" && "bg-[var(--git-branch)]",
            entry.status === "failed" && "bg-destructive",
            entry.status === "running" && "bg-[var(--git-modified)]",
          )}
        />
      ) : null}

      <AgentProviderMark
        working={working}
        label={providerMeta.label}
        className="relative z-[1] mt-0.5"
      >
        <ProviderLogo />
      </AgentProviderMark>

      <span className="relative z-[1] min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">
          <span className="min-w-0 basis-full truncate text-[13px] font-semibold tracking-[-0.015em] text-[var(--ag-text)] sm:basis-auto sm:flex-1">
            {entry.title}
          </span>
          <AgentStatusChip tone={STATUS_TONE[entry.status]} className="shrink-0">
            {statusLabel}
          </AgentStatusChip>
          <time dateTime={new Date(entry.updatedAt * 1000).toISOString()} title={new Date(entry.updatedAt * 1000).toLocaleString()} className="ml-auto shrink-0 text-[10px] tabular-nums text-[var(--ag-text-3)] sm:min-w-20 sm:text-right">
            {relativeDate}
          </time>
        </span>

        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--ag-text-2)]">
          <span className="max-w-40 truncate font-medium">{entry.repoName}</span>
          <span aria-hidden className="size-0.5 rounded-full bg-[var(--ag-text-3)]" />
          <span>{providerMeta.label}</span>
          {entry.isWorktree ? (
            <span
              className="inline-flex max-w-full items-center gap-1 truncate"
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
            <span className="tabular-nums" title={t("agentOverview.diffStatHint")}>
              <span>{t("agentOverview.files", { count: diffStat.files })}</span>{" "}
              <span className="text-[var(--git-added)]">+{diffStat.additions}</span>{" "}
              <span className="text-[var(--git-removed)]">−{diffStat.deletions}</span>
            </span>
          ) : null}
          {entry.costUsd ? (
            <span className="tabular-nums">{formatUsd(entry.costUsd)}</span>
          ) : null}
        </span>

        {entry.preview ? (
          <span className="mt-1 line-clamp-1 text-[12px] leading-5 text-[var(--ag-text-2)]">
            {entry.preview}
          </span>
        ) : null}
      </span>
      <ArrowUpRight aria-hidden className="mt-1 hidden size-3.5 shrink-0 text-[var(--ag-text-3)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:block" />
    </m.button>
  );
});
