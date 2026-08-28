import { createFileRoute } from "@tanstack/react-router";
import { Bot, GitPullRequest, Inbox as InboxIcon, RefreshCw, TriangleAlert, Eye } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { InboxAgentRow } from "@/components/inbox/inbox-agent-row";
import { InboxCiRow } from "@/components/inbox/inbox-ci-row";
import { InboxPrRow } from "@/components/inbox/inbox-pr-row";
import { InboxSection } from "@/components/inbox/inbox-section";
import { useInboxPaths } from "@/components/inbox/use-inbox-paths";
import { useInboxTargets } from "@/components/inbox/use-inbox-targets";
import { Button } from "@/components/ui/button";
import { useAgentOverviewEntries } from "@/lib/agents/use-agent-overview";
import { formatRelative } from "@/lib/format";
import { INBOX_REFRESH_INTERVAL_MS, useInboxStore } from "@/lib/inbox-store";

import { SpinIcon } from "@/components/motion/kit";

export const Route = createFileRoute("/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const { t } = useTranslation();
  const paths = useInboxPaths();
  const sections = useInboxStore((s) => s.sections);
  const errors = useInboxStore((s) => s.errors);
  const loading = useInboxStore((s) => s.loading);
  const lastLoadedAt = useInboxStore((s) => s.lastLoadedAt);
  const refresh = useInboxStore((s) => s.refresh);
  const { openPr, openCi, openAgentThread } = useInboxTargets();

  const agentEntries = useAgentOverviewEntries();
  const activeAgents = useMemo(
    () => agentEntries.filter((entry) => entry.status !== "idle"),
    [agentEntries],
  );

  useEffect(() => {
    void refresh(paths);
    const timer = window.setInterval(() => void refresh(paths), INBOX_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paths, refresh]);

  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-4 px-6 py-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <InboxIcon className="size-5 shrink-0 text-muted-foreground" />
          <div>
            <h1 className="font-heading text-2xl font-semibold leading-tight">{t("inbox.title")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("inbox.subtitle", { count: paths.length })}
              {lastLoadedAt ? ` · ${t("inbox.updated", { time: formatRelative(new Date(lastLoadedAt).toISOString()) })}` : ""}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void refresh(paths)}
        >
          <SpinIcon icon={RefreshCw} active={loading} className="size-3.5" />
          {t("inbox.refresh")}
        </Button>
      </div>

      {errors.length > 0 ? (
        <div className="rounded-lg border border-git-modified/40 bg-git-modified/5 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-git-modified">
            {t("inbox.repoErrors", { count: errors.length })}
          </span>
          <ul className="mt-1 space-y-0.5">
            {errors.map((error) => (
              <li key={error.path} className="truncate" title={`${error.path}: ${error.message}`}>
                {error.repoName} — {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <InboxSection
        icon={GitPullRequest}
        title={t("inbox.sections.myPrs")}
        count={sections.myPrs.length}
        emptyHint={t("inbox.empty.myPrs")}
        loading={loading}
      >
        {sections.myPrs.map((item) => (
          <InboxPrRow key={item.key} item={item} onOpen={(pr) => openPr(pr.path, pr.number)} />
        ))}
      </InboxSection>

      <InboxSection
        icon={Eye}
        title={t("inbox.sections.reviewRequested")}
        count={sections.reviewRequested.length}
        tone="attention"
        emptyHint={t("inbox.empty.reviewRequested")}
        loading={loading}
      >
        {sections.reviewRequested.map((item) => (
          <InboxPrRow key={item.key} item={item} onOpen={(pr) => openPr(pr.path, pr.number)} />
        ))}
      </InboxSection>

      <InboxSection
        icon={TriangleAlert}
        title={t("inbox.sections.redRuns")}
        count={sections.redRuns.length}
        tone="danger"
        emptyHint={t("inbox.empty.redRuns")}
        loading={loading}
      >
        {sections.redRuns.map((item) => (
          <InboxCiRow key={item.key} item={item} onOpen={(run) => openCi(run.path)} />
        ))}
      </InboxSection>

      <InboxSection
        icon={Bot}
        title={t("inbox.sections.agents")}
        count={activeAgents.length}
        tone="attention"
        emptyHint={t("inbox.empty.agents")}
      >
        {activeAgents.map((entry) => (
          <InboxAgentRow key={entry.key} entry={entry} onOpen={openAgentThread} />
        ))}
      </InboxSection>
    </main>
  );
}
